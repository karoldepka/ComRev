import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export type EnvMapStyle = 'gradient' | 'studio' | 'starfield' | 'sunset' | 'neon' | 'custom';

export interface EnvMapPipeParams {
  style?: EnvMapStyle;
  seed?: number;
  intensity?: number;
  customImageDataUrl?: string;
}

export class EnvMapPipe implements EffectPipe {
  readonly name = 'envMap';
  /** PMREM-processed env texture — used for scene.environment and mat.envMap. */
  private texture: THREE.Texture | null = null;
  /**
   * Raw image texture for the matcap shader uniform.
   * We do NOT use mat.map because TextGeometry has three separate UV spaces
   * (front cap, side walls, bevel) that create sharp seams.  Instead we sample
   * based on the view-space surface normal inside an onBeforeCompile patch so
   * the image maps smoothly onto front-facing surfaces with no UV discontinuity.
   */
  private mapTexture: THREE.Texture | null = null;
  /** Per-material uniform objects so we can update values without recompiling. */
  private matUniforms = new WeakMap<THREE.MeshStandardMaterial, {
    tCustomEnv: { value: THREE.Texture | null };
    tCustomEnvIntensity: { value: number };
  }>();

  private sceneRef: THREE.Scene | null = null;
  private meshRef: THREE.Mesh | THREE.Group | null = null;
  private rendererRef: any = null;
  private lastStyle = '';
  private lastSeed = -1;
  private lastCustomUrl = '';
  private loadingCustom = false;
  /** Scene environment saved at setup so we can restore it on dispose. */
  private savedSceneEnv: THREE.Texture | null = null;
  /** Per-material envMap + intensity saved before this pipe overrides them. */
  private savedMatEnv = new Map<THREE.MeshStandardMaterial, { envMap: THREE.Texture | null; envMapIntensity: number }>();

  constructor(public params: EnvMapPipeParams = {}) {}

  // ── Procedural env-map builder ──────────────────────────────────────────────

  private buildTexture(style: Exclude<EnvMapStyle, 'custom'>, seed: number): THREE.Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    const rng = makeRng(seed);

    switch (style) {
      case 'gradient': {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#00ff88');
        g.addColorStop(0.6, '#0088ff'); g.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
        ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.arc(cx, cy, i * 90, 0, Math.PI * 2); ctx.stroke(); }
        break;
      }
      case 'studio': {
        ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, size, size);
        const kl = ctx.createRadialGradient(cx * 0.4, cy * 0.25, 0, cx * 0.4, cy * 0.25, size * 0.55);
        kl.addColorStop(0, 'rgba(255,255,255,0.95)'); kl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = kl; ctx.fillRect(0, 0, size, size);
        break;
      }
      case 'starfield': {
        ctx.fillStyle = '#04040e'; ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 350; i++) {
          const x = rng() * size, y = rng() * size, r = rng() * 1.8 + 0.3;
          const b = Math.floor(rng() * 100 + 155);
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 25)})`; ctx.fill();
        }
        break;
      }
      case 'sunset': {
        const g = ctx.createLinearGradient(0, 0, 0, size);
        g.addColorStop(0, '#080025'); g.addColorStop(0.35, '#2a0068');
        g.addColorStop(0.6, '#cc2200'); g.addColorStop(0.78, '#ff7700');
        g.addColorStop(1, '#ffcc33');
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
        break;
      }
      case 'neon': {
        ctx.fillStyle = '#030310'; ctx.fillRect(0, 0, size, size);
        const neonColors = ['#ff00ff', '#00ffff', '#ff6600', '#00ff88', '#ff0066'];
        for (let i = 0; i < 12; i++) {
          const x1 = rng() * size, y1 = rng() * size, x2 = rng() * size, y2 = rng() * size;
          const c = neonColors[Math.floor(rng() * neonColors.length)];
          ctx.strokeStyle = c; ctx.lineWidth = 0.8 + rng() * 2.5;
          ctx.globalAlpha = 0.25 + rng() * 0.45;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  // ── Custom image loader ─────────────────────────────────────────────────────

  private loadCustomTexture(dataUrl: string) {
    if (this.loadingCustom) return;
    this.loadingCustom = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      dataUrl,
      (tex) => {
        this.loadingCustom = false;
        this.lastCustomUrl = dataUrl;

        // Clone before PMREM consumes/disposes the original: we need the raw
        // image as the matcap uniform texture (sRGB, for correct display colours).
        const mapTex = tex.clone();
        mapTex.colorSpace = THREE.SRGBColorSpace;
        mapTex.needsUpdate = true;

        // PMREM-process the original for correct PBR envMap reflections.
        let envTex: THREE.Texture;
        if (this.rendererRef) {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(this.rendererRef);
          pmrem.compileEquirectangularShader();
          envTex = pmrem.fromEquirectangular(tex).texture;
          pmrem.dispose();
          tex.dispose();
        } else {
          tex.colorSpace = THREE.LinearSRGBColorSpace;
          tex.mapping = THREE.EquirectangularReflectionMapping;
          envTex = tex;
        }

        this.texture?.dispose();
        this.mapTexture?.dispose();
        this.texture = envTex;
        this.mapTexture = mapTex;

        if (this.sceneRef) this.sceneRef.environment = envTex;
        if (this.meshRef) this.applyToMesh(this.meshRef, this.params.intensity ?? 1.5);
      },
      undefined,
      (err) => {
        this.loadingCustom = false;
        console.error('EnvMapPipe: failed to load custom image', err);
      },
    );
  }

  // ── Matcap shader patch ─────────────────────────────────────────────────────

  /**
   * Injects a matcap-style sampler into MeshStandardMaterial's fragment shader.
   * Uses the THREE.js matcap UV formula (same as MeshMatcapMaterial) so the
   * image centre appears on front-facing surfaces and transitions smoothly to
   * the edges on angled faces — zero UV-seam artifacts at letter bevels.
   *
   * The uniform tCustomEnvIntensity acts as an on/off + blend knob so we can
   * update the value every frame without triggering a shader recompile.
   */
  private ensurePatched(mat: THREE.MeshStandardMaterial) {
    if (this.matUniforms.has(mat)) return;

    const u = {
      tCustomEnv: { value: null as THREE.Texture | null },
      tCustomEnvIntensity: { value: 0 },
    };
    this.matUniforms.set(mat, u);

    // Chain with any existing onBeforeCompile (e.g. bevel-normal patch from text geometry).
    const prevCompile = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = (shader, renderer) => {
      prevCompile(shader, renderer);
      Object.assign(shader.uniforms, u);
      shader.fragmentShader =
        'uniform sampler2D tCustomEnv;\nuniform float tCustomEnvIntensity;\n'
        + shader.fragmentShader;
      // Inject after normals are resolved; normal is in view-space at this point.
      // vViewPosition is declared by the standard MeshStandardMaterial vertex shader.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n'
        + 'if (tCustomEnvIntensity > 0.001) {\n'
        // Same matcap UV formula as THREE.js MeshMatcapMaterial:
        + '  vec3 _cvd = normalize(vViewPosition);\n'
        + '  vec3 _cvx = normalize(vec3(_cvd.z, 0.0, -_cvd.x));\n'
        + '  vec3 _cvy = cross(_cvd, _cvx);\n'
        + '  vec2 _muv = vec2(dot(_cvx, normal), dot(_cvy, normal)) * 0.495 + 0.5;\n'
        + '  vec4 _ccs = texture2D(tCustomEnv, _muv);\n'
        + '  diffuseColor.rgb = mix(diffuseColor.rgb, _ccs.rgb, clamp(tCustomEnvIntensity, 0.0, 1.0));\n'
        + '}',
      );
    };
    // Combine cache keys so the chained shader is compiled as a distinct variant.
    mat.customProgramCacheKey = () => prevKey() + '|envpipe_matcap';
    mat.needsUpdate = true;
  }

  // ── Mesh helpers ────────────────────────────────────────────────────────────

  private applyToMesh(mesh: THREE.Mesh | THREE.Group, intensity: number) {
    const isCustom = this.mapTexture != null;
    // intensity slider goes 0→3; we want full image at the default 1.5
    const mixFactor = isCustom ? Math.min(intensity / 1.5, 1.0) : 0;

    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (!mat?.isMeshStandardMaterial) return;

        // Save original env before first override so dispose() can restore it.
        if (!this.savedMatEnv.has(mat)) {
          this.savedMatEnv.set(mat, { envMap: mat.envMap, envMapIntensity: mat.envMapIntensity });
        }

        this.ensurePatched(mat);
        const u = this.matUniforms.get(mat)!;
        u.tCustomEnv.value = isCustom ? this.mapTexture : null;
        u.tCustomEnvIntensity.value = mixFactor;

        mat.envMap = this.texture;
        mat.envMapIntensity = intensity;
        mat.needsUpdate = true;
      }
    });
  }

  // ── EffectPipe interface ────────────────────────────────────────────────────

  setup(ctx: PipeSetupContext) {
    this.sceneRef = ctx.scene;
    this.rendererRef = ctx.renderer;
    this.savedSceneEnv = ctx.scene.environment as THREE.Texture | null;
    const { style = 'gradient', seed = 42, customImageDataUrl } = this.params;
    if (style === 'custom') {
      this.lastStyle = '';
      this.lastSeed = -1;
      if (customImageDataUrl) this.loadCustomTexture(customImageDataUrl);
    } else {
      this.texture = this.buildTexture(style, seed);
      this.lastStyle = style;
      this.lastSeed = seed;
      ctx.scene.environment = this.texture;
    }
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.meshRef = mesh;
    if (!mesh || !this.texture) return;
    this.applyToMesh(mesh, this.params.intensity ?? 1.5);
  }

  update(ctx: PipeFrameContext) {
    const { style = 'gradient', seed = 42, intensity = 1.5, customImageDataUrl } = this.params;
    this.meshRef = ctx.mesh;
    if (ctx.renderer && !this.rendererRef) this.rendererRef = ctx.renderer;

    if (style === 'custom') {
      // Invalidate procedural cache so switching back always rebuilds the texture.
      this.lastStyle = '';
      this.lastSeed = -1;

      if (customImageDataUrl && customImageDataUrl !== this.lastCustomUrl && !this.loadingCustom) {
        this.loadCustomTexture(customImageDataUrl);
      }

      // Keep envMapIntensity and matcap mix factor in sync each frame.
      if (ctx.mesh) {
        const mixFactor = this.mapTexture ? Math.min(intensity / 1.5, 1.0) : 0;
        ctx.mesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (!mat?.isMeshStandardMaterial) return;
            const u = this.matUniforms.get(mat);
            if (u) u.tCustomEnvIntensity.value = mixFactor;
            if (mat.envMapIntensity !== intensity) mat.envMapIntensity = intensity;
          }
        });
      }
    } else {
      // Switching away from custom: zero out the matcap on all mesh materials.
      if (this.mapTexture) {
        this.mapTexture.dispose();
        this.mapTexture = null;
        ctx.mesh?.traverse(child => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (!mat?.isMeshStandardMaterial) return;
            const u = this.matUniforms.get(mat);
            if (u) { u.tCustomEnv.value = null; u.tCustomEnvIntensity.value = 0; }
          }
        });
      }

      this.lastCustomUrl = '';
      if (style !== this.lastStyle || seed !== this.lastSeed) {
        this.texture?.dispose();
        this.texture = this.buildTexture(style, seed);
        this.lastStyle = style;
        this.lastSeed = seed;
        if (this.sceneRef) this.sceneRef.environment = this.texture;
        if (ctx.mesh) this.applyToMesh(ctx.mesh, intensity);
      } else if (ctx.mesh) {
        ctx.mesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat?.isMeshStandardMaterial && mat.envMapIntensity !== intensity) mat.envMapIntensity = intensity;
          }
        });
      }
    }
  }

  dispose() {
    // Restore scene environment to what it was before this pipe was applied.
    if (this.sceneRef) {
      this.sceneRef.environment = this.savedSceneEnv;
    }

    // Restore per-material envMap and envMapIntensity.
    this.savedMatEnv.forEach((saved, mat) => {
      mat.envMap = saved.envMap;
      mat.envMapIntensity = saved.envMapIntensity;
      // Zero out the matcap uniform so it no longer contributes.
      const u = this.matUniforms.get(mat);
      if (u) { u.tCustomEnv.value = null; u.tCustomEnvIntensity.value = 0; }
      mat.needsUpdate = true;
    });
    this.savedMatEnv.clear();

    this.texture?.dispose();
    this.texture = null;
    this.mapTexture?.dispose();
    this.mapTexture = null;
  }
}
