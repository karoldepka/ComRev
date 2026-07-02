import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';
import {
  EnvMapPipeParams, TextureSource, createTextureSource, normalizeEnvMapPipeParams, textureSourceKey,
} from './env-texture';

export type { EnvMapStyle, EnvMapPipeParams } from './env-texture';

// ── Matcap shader patch ──────────────────────────────────────────────────────

interface MatcapUniforms {
  tCustomEnv: { value: THREE.Texture | null };
  tCustomEnvIntensity: { value: number };
  origCompile: (shader: any, renderer: any) => void;
  origCacheKey: () => string;
}

// Injected into view-space after #include <normal_fragment_maps>.
// Maps view-space normal to matcap UV — seam-free across TextGeometry bevels.
const MATCAP_UNIFORMS_DECL =
  'uniform sampler2D tCustomEnv;\nuniform float tCustomEnvIntensity;\n';

const MATCAP_SAMPLE =
  'if (tCustomEnvIntensity > 0.001) {\n'
  + '  vec3 _cvd = normalize(vViewPosition);\n'
  + '  vec3 _cvx = normalize(vec3(_cvd.z, 0.0, -_cvd.x));\n'
  + '  vec3 _cvy = cross(_cvd, _cvx);\n'
  + '  vec2 _muv = vec2(dot(_cvx, normal), dot(_cvy, normal)) * 0.495 + 0.5;\n'
  + '  vec4 _ccs = texture2D(tCustomEnv, _muv);\n'
  + '  outgoingLight = mix(outgoingLight, _ccs.rgb, clamp(tCustomEnvIntensity, 0.0, 1.0));\n'
  + '}';

const OUTGOING_LIGHT_LINE =
  'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';

/**
 * Injects the matcap sampler into a MeshStandardMaterial, chaining with any
 * existing onBeforeCompile. Returns uniforms needed to update + restore later.
 */
function patchMatcap(mat: THREE.MeshStandardMaterial): MatcapUniforms {
  const origCompile = mat.onBeforeCompile;
  const origCacheKey = mat.customProgramCacheKey;
  const u: MatcapUniforms = {
    tCustomEnv: { value: null },
    tCustomEnvIntensity: { value: 0 },
    origCompile,
    origCacheKey,
  };
  mat.onBeforeCompile = (shader, renderer) => {
    origCompile(shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = MATCAP_UNIFORMS_DECL + shader.fragmentShader;
    if (shader.fragmentShader.includes(OUTGOING_LIGHT_LINE)) {
      shader.fragmentShader = shader.fragmentShader.replace(
        OUTGOING_LIGHT_LINE,
        OUTGOING_LIGHT_LINE + '\n' + MATCAP_SAMPLE,
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        MATCAP_SAMPLE + '\n#include <opaque_fragment>',
      );
    }
  };
  mat.customProgramCacheKey = () => origCacheKey() + '|envpipe_matcap';
  mat.needsUpdate = true;
  return u;
}

/** Restores original shader callbacks and zeroes uniforms. */
function unpatchMatcap(mat: THREE.MeshStandardMaterial, u: MatcapUniforms) {
  u.tCustomEnv.value = null;
  u.tCustomEnvIntensity.value = 0;
  mat.onBeforeCompile = u.origCompile;
  mat.customProgramCacheKey = u.origCacheKey;
  mat.needsUpdate = true;
}

// ── EnvMapPipe ───────────────────────────────────────────────────────────────

export class EnvMapPipe implements EffectPipe {
  readonly name = 'envMap';

  private source: TextureSource | null = null;
  private sourceKey = '';
  private sceneRef: THREE.Scene | null = null;
  private rendererRef: THREE.WebGLRenderer | null = null;
  private savedSceneEnv: THREE.Texture | null = null;
  private savedSceneBackground: THREE.Scene['background'] = null;

  // WeakMap keeps patched-material state without preventing GC.
  // savedIntensities (Map) is the canonical list of all patched materials —
  // iterate it in dispose() to reach patchedMats entries.
  private patchedMats = new WeakMap<THREE.MeshStandardMaterial, MatcapUniforms>();
  private savedIntensities = new Map<THREE.MeshStandardMaterial, number>();
  private savedEnvMaps = new Map<THREE.MeshStandardMaterial, THREE.Texture | null>();
  private savedMeshMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private generatedMaterials = new Set<THREE.Material>();

  constructor(public params: EnvMapPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.sceneRef = ctx.scene;
    this.rendererRef = (ctx.renderer as THREE.WebGLRenderer) ?? null;
    this.savedSceneEnv = ctx.scene.environment as THREE.Texture | null;
    this.savedSceneBackground = ctx.scene.background;
    this._refreshSource();
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    const params = normalizeEnvMapPipeParams(this.params);
    if (mesh) this._applyToMesh(mesh, params.intensity ?? 1.5);
  }

  update(ctx: PipeFrameContext) {
    if (ctx.renderer && !this.rendererRef) this.rendererRef = ctx.renderer as THREE.WebGLRenderer;

    const params = normalizeEnvMapPipeParams(this.params);
    const key = textureSourceKey(params);
    if (key !== this.sourceKey) {
      this.source?.dispose();
      this.source = createTextureSource(params, this.rendererRef);
      this.sourceKey = key;
    }

    this.source?.tick(ctx.delta, this.rendererRef, params);

    // Keep scene.environment in sync with the source's PMREM-ready texture.
    const envTex = this.source?.envTexture ?? null;
    if (this.sceneRef && this.sceneRef.environment !== envTex) {
      this.sceneRef.environment = envTex;
    }

    // When the source provides both an env texture and a map texture (animated
    // shaders: fire, plasma, smoke, noise), optionally use it as scene.background
    // so the fire/plasma wraps the background of the 3D scene.
    if (this.sceneRef) {
      const mapTex = this.source?.mapTexture ?? null;
      const showBg = params.showAsBackground !== false && envTex != null && mapTex != null;
      const currentBg = this.sceneRef.background;
      if (showBg && currentBg !== envTex) {
        this.sceneRef.background = envTex;
      } else if (!showBg && currentBg === envTex) {
        this.sceneRef.background = this.savedSceneBackground;
      }
      if (showBg) {
        this.sceneRef.backgroundBlurriness = params.backgroundBlur ?? 0;
      }
    }

    if (ctx.mesh) this._applyToMesh(ctx.mesh, params.intensity ?? 1.5);
  }

  dispose() {
    if (this.sceneRef) {
      this.sceneRef.environment = this.savedSceneEnv;
      this.sceneRef.background = this.savedSceneBackground;
    }

    this.savedIntensities.forEach((savedIntensity, mat) => {
      mat.envMapIntensity = savedIntensity;
      mat.envMap = this.savedEnvMaps.get(mat) ?? null;
      const u = this.patchedMats.get(mat);
      if (u) unpatchMatcap(mat, u);
      mat.needsUpdate = true;
    });
    this.savedIntensities.clear();
    this.savedEnvMaps.clear();

    this.savedMeshMaterials.forEach((savedMaterial, mesh) => {
      this.disposeGeneratedMaterial(mesh.material);
      mesh.material = savedMaterial;
    });
    this.savedMeshMaterials.clear();
    this.generatedMaterials.clear();

    this.source?.dispose();
    this.source = null;
  }

  private _refreshSource() {
    const params = normalizeEnvMapPipeParams(this.params);
    this.source?.dispose();
    this.source = createTextureSource(params, this.rendererRef);
    this.sourceKey = textureSourceKey(params);
  }

  private _applyToMesh(mesh: THREE.Mesh | THREE.Group, intensity: number) {
    const mapTex = this.source?.mapTexture ?? null;
    const envTex = this.source?.envTexture ?? null;
    const mixFactor = mapTex ? Math.min(intensity / 1.5, 1.0) : 0;

    mesh.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      // Animated sources: always use MeshMatcapMaterial to directly sample the
      // RT texture each frame (bypasses Three.js's cube-UV cache which would
      // freeze the animation when only scene.environment is used).
      if (mapTex) {
        this.applyAnimatedMaterial(child, mapTex);
        return;
      }

      this.restoreMeshMaterial(child);

      const mat = child.material as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) return;

      if (!this.savedIntensities.has(mat)) {
        this.savedIntensities.set(mat, mat.envMapIntensity);
        this.savedEnvMaps.set(mat, mat.envMap ?? null);
      }
      if (!this.patchedMats.has(mat)) {
        this.patchedMats.set(mat, patchMatcap(mat));
      }

      const u = this.patchedMats.get(mat)!;
      u.tCustomEnv.value = mapTex;
      u.tCustomEnvIntensity.value = mixFactor;
      if (mat.envMap !== envTex) {
        mat.envMap = envTex;
        mat.needsUpdate = true;
      }
      mat.envMapIntensity = intensity;
    });
  }

  private applyAnimatedMaterial(mesh: THREE.Mesh, matcap: THREE.Texture) {
    const currentMat = mesh.material;

    // Zone-material mesh: patch MeshStandardMaterial slots in-place with the
    // matcap shader; MeshBasicMaterial slots (face cap) are skipped — they are
    // naturally immune to scene.environment and don't need special handling.
    if (Array.isArray(currentMat)) {
      for (const mat of currentMat) {
        const stdMat = mat as THREE.MeshStandardMaterial;
        if (!stdMat.isMeshStandardMaterial) continue;
        if (!this.savedIntensities.has(stdMat)) {
          this.savedIntensities.set(stdMat, stdMat.envMapIntensity);
          this.savedEnvMaps.set(stdMat, stdMat.envMap ?? null);
          this.patchedMats.set(stdMat, patchMatcap(stdMat));
        }
        const u = this.patchedMats.get(stdMat)!;
        u.tCustomEnv.value = matcap;
        u.tCustomEnvIntensity.value = 1.0;
      }
      return;
    }

    // Single-material mesh — original behaviour.
    if (!this.savedMeshMaterials.has(mesh)) {
      this.savedMeshMaterials.set(mesh, currentMat);
    }
    const currentSingle = Array.isArray(currentMat) ? null : currentMat;
    if (
      currentSingle instanceof THREE.MeshMatcapMaterial &&
      currentSingle.userData.envMapPipeGenerated
    ) {
      if (currentSingle.matcap !== matcap) {
        currentSingle.matcap = matcap;
        currentSingle.needsUpdate = true;
      }
      return;
    }
    this.disposeGeneratedMaterial(currentMat);
    const next = new THREE.MeshMatcapMaterial({
      color: 0xffffff,
      matcap,
    });
    next.userData.envMapPipeGenerated = true;
    this.generatedMaterials.add(next);
    mesh.material = next;
  }

  private restoreMeshMaterial(mesh: THREE.Mesh) {
    const savedMaterial = this.savedMeshMaterials.get(mesh);
    if (!savedMaterial) return;
    this.disposeGeneratedMaterial(mesh.material);
    mesh.material = savedMaterial;
    this.savedMeshMaterials.delete(mesh);
  }

  private disposeGeneratedMaterial(material: THREE.Material | THREE.Material[]) {
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((mat) => {
      if (!this.generatedMaterials.has(mat)) return;
      mat.dispose();
      this.generatedMaterials.delete(mat);
    });
  }
}
