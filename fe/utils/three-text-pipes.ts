import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let x = Math.imul(s ^ (s >>> 15), s | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Contexts ─────────────────────────────────────────────────────────────────
export interface PipeSetupContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: any; // expo-three Renderer (WebGLRenderer underneath)
  gl: any;
  width: number;
  height: number;
}

export interface PipeFrameContext extends PipeSetupContext {
  mesh: THREE.Mesh | THREE.Group | null;
  time: number;  // seconds since scene start
  delta: number; // seconds since last frame
}

// ── Base pipe interface ───────────────────────────────────────────────────────
export interface EffectPipe {
  readonly name: string;
  /** Called once after renderer/scene/camera are ready */
  setup(ctx: PipeSetupContext): void;
  /** Implement to register a post-processing pass into the shared EffectComposer */
  addComposerPass?(composer: EffectComposer, ctx: PipeSetupContext): void;
  /** Called each frame before render */
  update?(ctx: PipeFrameContext): void;
  /** Called whenever the text mesh is rebuilt */
  onMeshChanged?(mesh: THREE.Mesh | THREE.Group | null, ctx: PipeSetupContext): void;
  dispose(): void;
}

// ── PipelineManager ───────────────────────────────────────────────────────────
export class PipelineManager {
  private composer: EffectComposer | null = null;
  private setupCtx: PipeSetupContext | null = null;

  constructor(public readonly pipes: EffectPipe[]) {}

  setup(ctx: PipeSetupContext) {
    this.setupCtx = ctx;
    const ppPipes = this.pipes.filter(p => p.addComposerPass);
    if (ppPipes.length > 0) {
      this.composer = new EffectComposer(ctx.renderer);
      this.composer.addPass(new RenderPass(ctx.scene, ctx.camera));
      for (const p of ppPipes) p.addComposerPass!(this.composer, ctx);
      this.composer.addPass(new OutputPass());
    }
    for (const p of this.pipes) p.setup(ctx);
  }

  render(ctx: PipeFrameContext) {
    if (this.composer) {
      this.composer.render(ctx.delta);
    } else {
      ctx.renderer.render(ctx.scene, ctx.camera);
    }
  }

  update(ctx: PipeFrameContext) {
    for (const p of this.pipes) p.update?.(ctx);
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null) {
    if (!this.setupCtx) return;
    for (const p of this.pipes) p.onMeshChanged?.(mesh, this.setupCtx);
  }

  dispose() {
    for (const p of this.pipes) p.dispose();
    this.composer?.dispose();
    this.composer = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPES
// ═══════════════════════════════════════════════════════════════════════════════

// ── BloomPipe ─────────────────────────────────────────────────────────────────
export interface BloomPipeParams {
  threshold?: number; // 0–1, luminance cutoff (default 0.2)
  strength?: number;  // 0–3, bloom brightness (default 0.8)
  radius?: number;    // 0–1, spread (default 0.5)
}

export class BloomPipe implements EffectPipe {
  readonly name = 'bloom';
  private pass: InstanceType<typeof UnrealBloomPass> | null = null;
  constructor(public params: BloomPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, ctx: PipeSetupContext) {
    const { threshold = 0.2, strength = 0.8, radius = 0.5 } = this.params;
    this.pass = new UnrealBloomPass(new THREE.Vector2(ctx.width, ctx.height), strength, radius, threshold);
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    const { threshold = 0.2, strength = 0.8, radius = 0.5 } = this.params;
    this.pass.threshold = threshold;
    this.pass.strength = strength;
    this.pass.radius = radius;
  }

  dispose() { this.pass = null; }
}

// ── DepthOfFieldPipe ──────────────────────────────────────────────────────────
export interface DepthOfFieldPipeParams {
  focus?: number;    // focal distance in world units (default 15)
  aperture?: number; // 0.00001–0.001 (default 0.00003)
  maxBlur?: number;  // 0–0.05 (default 0.01)
}

export class DepthOfFieldPipe implements EffectPipe {
  readonly name = 'depthOfField';
  private pass: InstanceType<typeof BokehPass> | null = null;
  constructor(public params: DepthOfFieldPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, ctx: PipeSetupContext) {
    const { focus = 15, aperture = 0.00003, maxBlur = 0.01 } = this.params;
    this.pass = new BokehPass(ctx.scene, ctx.camera, { focus, aperture, maxBlur });
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    const uniforms = (this.pass as any).uniforms;
    if (!uniforms) return;
    if (this.params.focus !== undefined) uniforms['focus'].value = this.params.focus;
    if (this.params.aperture !== undefined) uniforms['aperture'].value = this.params.aperture;
    if (this.params.maxBlur !== undefined) uniforms['maxblur'].value = this.params.maxBlur;
  }

  dispose() { this.pass = null; }
}

// ── ChromaticAberrationPipe ───────────────────────────────────────────────────
export interface ChromaticAberrationPipeParams {
  offset?: number; // channel separation 0–0.02 (default 0.005)
}

const chromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset: { value: 0.005 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec2 dir = normalize(vUv - 0.5);
      float dist = length(vUv - 0.5);
      vec4 cr = texture2D(tDiffuse, vUv + dir * offset * dist);
      vec4 cg = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv - dir * offset * dist);
      gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
    }
  `,
};

export class ChromaticAberrationPipe implements EffectPipe {
  readonly name = 'chromaticAberration';
  private pass: InstanceType<typeof ShaderPass> | null = null;
  constructor(public params: ChromaticAberrationPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new ShaderPass(chromaticAberrationShader as any);
    this.pass.uniforms['offset'].value = this.params.offset ?? 0.005;
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (this.pass && this.params.offset !== undefined) {
      this.pass.uniforms['offset'].value = this.params.offset;
    }
  }

  dispose() { this.pass = null; }
}

// ── FilmGrainPipe ─────────────────────────────────────────────────────────────
export interface FilmGrainPipeParams {
  intensity?: number; // 0–1 (default 0.35)
  grayscale?: boolean; // default false
}

export class FilmGrainPipe implements EffectPipe {
  readonly name = 'filmGrain';
  private pass: InstanceType<typeof FilmPass> | null = null;
  constructor(public params: FilmGrainPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    const { intensity = 0.35, grayscale = false } = this.params;
    this.pass = new FilmPass(intensity, grayscale);
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    if (this.params.intensity !== undefined) (this.pass as any).uniforms.intensity.value = this.params.intensity;
    if (this.params.grayscale !== undefined) (this.pass as any).uniforms.grayscale.value = this.params.grayscale;
  }

  dispose() { this.pass = null; }
}

// ── GlitchPipe ────────────────────────────────────────────────────────────────
export interface GlitchPipeParams {
  wildGlitch?: boolean; // full-screen chaos (default false)
  dtSize?: number;      // noise texture size 16–256 (default 64)
}

export class GlitchPipe implements EffectPipe {
  readonly name = 'glitch';
  private pass: InstanceType<typeof GlitchPass> | null = null;
  constructor(public params: GlitchPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new GlitchPass(this.params.dtSize ?? 64);
    (this.pass as any).goWild = this.params.wildGlitch ?? false;
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (this.pass) (this.pass as any).goWild = this.params.wildGlitch ?? false;
  }

  dispose() { this.pass = null; }
}

// ── EnvMapPipe ────────────────────────────────────────────────────────────────
export type EnvMapStyle = 'gradient' | 'studio' | 'starfield' | 'sunset' | 'neon';

export interface EnvMapPipeParams {
  style?: EnvMapStyle; // (default 'gradient')
  seed?: number;       // for stochastic styles (default 42)
  intensity?: number;  // envMapIntensity (default 1.5)
}

export class EnvMapPipe implements EffectPipe {
  readonly name = 'envMap';
  private texture: THREE.Texture | null = null;
  private sceneRef: THREE.Scene | null = null;
  private lastStyle: string = '';
  private lastSeed: number = -1;

  constructor(public params: EnvMapPipeParams = {}) {}

  private buildTexture(style: EnvMapStyle, seed: number): THREE.Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    const rng = makeRng(seed);

    switch (style) {
      case 'gradient': {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, '#00ff88');
        g.addColorStop(0.6, '#0088ff');
        g.addColorStop(1, '#1a1a1a');
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
        const fl = ctx.createRadialGradient(cx * 1.65, cy * 1.6, 0, cx * 1.65, cy * 1.6, size * 0.45);
        fl.addColorStop(0, 'rgba(180,200,255,0.5)'); fl.addColorStop(1, 'rgba(180,200,255,0)');
        ctx.fillStyle = fl; ctx.fillRect(0, 0, size, size);
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
        const nebHues = [200, 280, 320];
        for (const h of nebHues) {
          const nx = rng() * size, ny = rng() * size;
          const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, size * (0.18 + rng() * 0.25));
          ng.addColorStop(0, `hsla(${h},80%,55%,0.18)`); ng.addColorStop(1, 'transparent');
          ctx.fillStyle = ng; ctx.fillRect(0, 0, size, size);
        }
        break;
      }
      case 'sunset': {
        const g = ctx.createLinearGradient(0, 0, 0, size);
        g.addColorStop(0, '#080025'); g.addColorStop(0.35, '#2a0068');
        g.addColorStop(0.6, '#cc2200'); g.addColorStop(0.78, '#ff7700');
        g.addColorStop(1, '#ffcc33');
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
        const sg = ctx.createRadialGradient(cx, size * 0.78, 0, cx, size * 0.78, size * 0.32);
        sg.addColorStop(0, 'rgba(255,255,160,1)'); sg.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = sg; ctx.fillRect(0, 0, size, size);
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
        for (const c of neonColors) {
          const nx = rng() * size, ny = rng() * size;
          const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, size * (0.15 + rng() * 0.2));
          ng.addColorStop(0, c + 'bb'); ng.addColorStop(1, 'transparent');
          ctx.fillStyle = ng; ctx.fillRect(0, 0, size, size);
        }
        break;
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  setup(ctx: PipeSetupContext) {
    this.sceneRef = ctx.scene;
    const { style = 'gradient', seed = 42 } = this.params;
    this.texture = this.buildTexture(style, seed);
    this.lastStyle = style;
    this.lastSeed = seed;
    ctx.scene.environment = this.texture;
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!mesh || !this.texture) return;
    const intensity = this.params.intensity ?? 1.5;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.envMap = this.texture; mat.envMapIntensity = intensity; mat.needsUpdate = true; }
      }
    });
  }

  update(ctx: PipeFrameContext) {
    const { style = 'gradient', seed = 42, intensity = 1.5 } = this.params;
    if (style !== this.lastStyle || seed !== this.lastSeed) {
      this.texture?.dispose();
      this.texture = this.buildTexture(style, seed);
      this.lastStyle = style; this.lastSeed = seed;
      if (this.sceneRef) this.sceneRef.environment = this.texture;
      if (ctx.mesh) this.onMeshChanged(ctx.mesh, ctx);
    } else if (ctx.mesh) {
      // Keep intensity in sync if it changed
      ctx.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial && mat.envMapIntensity !== intensity) {
            mat.envMapIntensity = intensity;
          }
        }
      });
    }
  }

  dispose() { this.texture?.dispose(); this.texture = null; }
}

// ── NeonGlowPipe ──────────────────────────────────────────────────────────────
export interface NeonGlowPipeParams {
  color?: number;          // hex color (default 0xff00ff)
  intensity?: number;      // emissive intensity 0–2 (default 0.8)
  pulseSpeed?: number;     // pulses per second (default 1.0)
  pulseAmplitude?: number; // modulation depth 0–1 (default 0.3)
}

export class NeonGlowPipe implements EffectPipe {
  readonly name = 'neonGlow';
  private lights: THREE.PointLight[] = [];
  private scene: THREE.Scene | null = null;
  private mesh: THREE.Mesh | THREE.Group | null = null;

  constructor(public params: NeonGlowPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const c = new THREE.Color(this.params.color ?? 0xff00ff);
    const l1 = new THREE.PointLight(c, 2, 40); l1.position.set(-6, 5, 10);
    const l2 = new THREE.PointLight(c, 2, 40); l2.position.set(6, -5, 10);
    ctx.scene.add(l1, l2);
    this.lights = [l1, l2];
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (!mesh) return;
    const { color = 0xff00ff, intensity = 0.8 } = this.params;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.emissive = new THREE.Color(color); mat.emissiveIntensity = intensity; mat.needsUpdate = true; }
      }
    });
  }

  update(ctx: PipeFrameContext) {
    const { color = 0xff00ff, intensity = 0.8, pulseSpeed = 1.0, pulseAmplitude = 0.3 } = this.params;
    const pulse = 1 + Math.sin(ctx.time * pulseSpeed * Math.PI * 2) * pulseAmplitude;
    const c = new THREE.Color(color);
    for (const l of this.lights) { l.color.copy(c); l.intensity = 2 * pulse; }
    if (this.mesh) {
      this.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial) { mat.emissive.copy(c); mat.emissiveIntensity = intensity * pulse; }
        }
      });
    }
  }

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}

// ── MetallicPresetPipe ────────────────────────────────────────────────────────
export type MetallicPreset = 'gold' | 'chrome' | 'copper' | 'holographic' | 'obsidian';

export interface MetallicPresetPipeParams {
  preset?: MetallicPreset; // (default 'gold')
}

const PRESETS: Record<MetallicPreset, { color: number; metalness: number; roughness: number }> = {
  gold:        { color: 0xffd700, metalness: 0.95, roughness: 0.15 },
  chrome:      { color: 0xe8e8f0, metalness: 1.0,  roughness: 0.04 },
  copper:      { color: 0xb87333, metalness: 0.9,  roughness: 0.28 },
  holographic: { color: 0xffffff, metalness: 0.8,  roughness: 0.1  },
  obsidian:    { color: 0x1a1020, metalness: 0.7,  roughness: 0.05 },
};

export class MetallicPresetPipe implements EffectPipe {
  readonly name = 'metallicPreset';
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private lastPreset: MetallicPreset | null = null;
  constructor(public params: MetallicPresetPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  private apply(mesh: THREE.Mesh | THREE.Group, preset: MetallicPreset) {
    const p = PRESETS[preset];
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.color.setHex(p.color); mat.metalness = p.metalness; mat.roughness = p.roughness; mat.needsUpdate = true; }
      }
    });
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (mesh && this.params.preset) this.apply(mesh, this.params.preset);
  }

  update(ctx: PipeFrameContext) {
    const preset = this.params.preset ?? 'gold';
    if (this.mesh && preset !== this.lastPreset) { this.apply(this.mesh, preset); this.lastPreset = preset; }
    if (preset === 'holographic' && this.mesh) {
      const hue = (ctx.time * 0.12) % 1;
      this.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial) mat.color.setHSL(hue, 0.8, 0.65);
        }
      });
    }
  }

  dispose() { this.mesh = null; }
}

// ── ParticleDustPipe ──────────────────────────────────────────────────────────
export interface ParticleDustPipeParams {
  count?: number;  // particle count (default 500)
  speed?: number;  // drift multiplier (default 0.5)
  size?: number;   // point size (default 0.06)
  color?: number;  // (default 0xffffff)
  seed?: number;   // (default 42)
  spread?: number; // scene radius (default 15)
}

export class ParticleDustPipe implements EffectPipe {
  readonly name = 'particleDust';
  private points: THREE.Points | null = null;
  private velocities = new Float32Array(0);
  private scene: THREE.Scene | null = null;
  private lastCount = 0;
  private lastSeed = -1;

  constructor(public params: ParticleDustPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.rebuild();
  }

  private rebuild() {
    const { count = 500, color = 0xffffff, seed = 42, spread = 15, size = 0.06 } = this.params;
    if (this.points && this.scene) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    const rng = makeRng(seed);
    const pos = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3]   = (rng() - 0.5) * spread * 2;
      pos[i3+1] = (rng() - 0.5) * spread * 1.2;
      pos[i3+2] = (rng() - 0.5) * spread;
      this.velocities[i3]   = (rng() - 0.5) * 0.018;
      this.velocities[i3+1] = (rng() - 0.5) * 0.018;
      this.velocities[i3+2] = (rng() - 0.5) * 0.010;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.55 });
    this.points = new THREE.Points(geo, mat);
    this.scene?.add(this.points);
    this.lastCount = count; this.lastSeed = seed;
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    const { count = 500, seed = 42, speed = 0.5, spread = 15 } = this.params;
    if (count !== this.lastCount || seed !== this.lastSeed) { this.rebuild(); return; }
    if (!this.points) return;
    const pos = this.points.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3]   += this.velocities[i3]   * speed;
      pos[i3+1] += this.velocities[i3+1] * speed;
      pos[i3+2] += this.velocities[i3+2] * speed;
      const lims = [spread * 2, spread * 1.2, spread];
      for (let k = 0; k < 3; k++) { if (pos[i3+k] > lims[k]) pos[i3+k] = -lims[k]; else if (pos[i3+k] < -lims[k]) pos[i3+k] = lims[k]; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.points && this.scene) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    this.points = null;
  }
}

// ── WireframePipe ─────────────────────────────────────────────────────────────
export interface WireframePipeParams {
  color?: number;   // (default 0x00ff88)
  opacity?: number; // (default 0.25)
}

export class WireframePipe implements EffectPipe {
  readonly name = 'wireframe';
  private overlay: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  constructor(public params: WireframePipeParams = {}) {}

  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!this.scene) return;
    if (this.overlay) { this.scene.remove(this.overlay); this.overlay = null; }
    if (!mesh) return;
    const { color = 0x00ff88, opacity = 0.25 } = this.params;
    const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity });
    const clone = mesh.clone(true);
    clone.traverse(c => { if (c instanceof THREE.Mesh) c.material = mat; });
    this.overlay = clone as THREE.Group;
    this.scene.add(this.overlay);
  }

  update(ctx: PipeFrameContext) {
    if (this.overlay && ctx.mesh) this.overlay.rotation.copy(ctx.mesh.rotation);
  }

  dispose() {
    if (this.overlay && this.scene) this.scene.remove(this.overlay);
    this.overlay = null;
  }
}

// ── OutlinePipe ───────────────────────────────────────────────────────────────
export interface OutlinePipeParams {
  color?: number;      // outline color (default 0xff6600)
  thickness?: number;  // scale factor e.g. 1.05 (default 1.05)
}

export class OutlinePipe implements EffectPipe {
  readonly name = 'outline';
  private outlineGroup: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  constructor(public params: OutlinePipeParams = {}) {}

  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!this.scene) return;
    if (this.outlineGroup) { this.scene.remove(this.outlineGroup); this.outlineGroup = null; }
    if (!mesh) return;
    const { color = 0xff6600, thickness = 1.05 } = this.params;
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    const clone = mesh.clone(true);
    clone.scale.multiplyScalar(thickness);
    clone.traverse(c => { if (c instanceof THREE.Mesh) c.material = mat; });
    this.outlineGroup = clone as THREE.Group;
    this.scene.add(this.outlineGroup);
  }

  update(ctx: PipeFrameContext) {
    if (this.outlineGroup && ctx.mesh) {
      this.outlineGroup.rotation.copy(ctx.mesh.rotation);
      this.outlineGroup.position.copy(ctx.mesh.position);
    }
  }

  dispose() {
    if (this.outlineGroup && this.scene) this.scene.remove(this.outlineGroup);
    this.outlineGroup = null;
  }
}
