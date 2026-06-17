import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';
import {
  EnvMapPipeParams, TextureSource, createTextureSource, textureSourceKey,
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
  + '  diffuseColor.rgb = mix(diffuseColor.rgb, _ccs.rgb, clamp(tCustomEnvIntensity, 0.0, 1.0));\n'
  + '}';

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
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n' + MATCAP_SAMPLE,
    );
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

  // WeakMap keeps patched-material state without preventing GC.
  // savedIntensities (Map) is the canonical list of all patched materials —
  // iterate it in dispose() to reach patchedMats entries.
  private patchedMats = new WeakMap<THREE.MeshStandardMaterial, MatcapUniforms>();
  private savedIntensities = new Map<THREE.MeshStandardMaterial, number>();

  constructor(public params: EnvMapPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.sceneRef = ctx.scene;
    this.rendererRef = (ctx.renderer as THREE.WebGLRenderer) ?? null;
    this.savedSceneEnv = ctx.scene.environment as THREE.Texture | null;
    this._refreshSource();
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (mesh) this._applyToMesh(mesh, this.params.intensity ?? 1.5);
  }

  update(ctx: PipeFrameContext) {
    if (ctx.renderer && !this.rendererRef) this.rendererRef = ctx.renderer as THREE.WebGLRenderer;

    const key = textureSourceKey(this.params);
    if (key !== this.sourceKey) {
      this.source?.dispose();
      this.source = createTextureSource(this.params, this.rendererRef);
      this.sourceKey = key;
    }

    this.source?.tick(ctx.delta, this.rendererRef, this.params);

    // Keep scene.environment in sync with the source's PMREM-ready texture.
    const envTex = this.source?.envTexture ?? null;
    if (this.sceneRef && this.sceneRef.environment !== envTex) {
      this.sceneRef.environment = envTex;
    }

    if (ctx.mesh) this._applyToMesh(ctx.mesh, this.params.intensity ?? 1.5);
  }

  dispose() {
    if (this.sceneRef) this.sceneRef.environment = this.savedSceneEnv;

    this.savedIntensities.forEach((savedIntensity, mat) => {
      mat.envMapIntensity = savedIntensity;
      const u = this.patchedMats.get(mat);
      if (u) unpatchMatcap(mat, u);
    });
    this.savedIntensities.clear();

    this.source?.dispose();
    this.source = null;
  }

  private _refreshSource() {
    this.source?.dispose();
    this.source = createTextureSource(this.params, this.rendererRef);
    this.sourceKey = textureSourceKey(this.params);
  }

  private _applyToMesh(mesh: THREE.Mesh | THREE.Group, intensity: number) {
    const mapTex = this.source?.mapTexture ?? null;
    const mixFactor = mapTex ? Math.min(intensity / 1.5, 1.0) : 0;

    mesh.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) return;

      if (!this.savedIntensities.has(mat)) {
        this.savedIntensities.set(mat, mat.envMapIntensity);
      }
      if (!this.patchedMats.has(mat)) {
        this.patchedMats.set(mat, patchMatcap(mat));
      }

      const u = this.patchedMats.get(mat)!;
      u.tCustomEnv.value = mapTex;
      u.tCustomEnvIntensity.value = mixFactor;
      mat.envMapIntensity = intensity;
    });
  }
}
