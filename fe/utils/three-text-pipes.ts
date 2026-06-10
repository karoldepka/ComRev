import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

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
  paused?: boolean;
  /** Called once after renderer/scene/camera are ready */
  setup(ctx: PipeSetupContext): void;
  /** Implement to register a post-processing pass into the shared EffectComposer */
  addComposerPass?(composer: EffectComposer, ctx: PipeSetupContext): void;
  /** Called each frame before render */
  update?(ctx: PipeFrameContext): void;
  /** Called whenever the text mesh is rebuilt */
  onMeshChanged?(mesh: THREE.Mesh | THREE.Group | null, ctx: PipeSetupContext): void;
  /** Restore mesh geometry to its pre-deformation state (before dispose) */
  restoreGeometry?(): void;
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
    for (const p of this.pipes) {
      if (!p.paused) p.update?.(ctx);
    }
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null) {
    if (!this.setupCtx) return;
    for (const p of this.pipes) p.onMeshChanged?.(mesh, this.setupCtx);
  }

  restoreGeometry() {
    for (const p of this.pipes) p.restoreGeometry?.();
  }

  dispose() {
    for (const p of this.pipes) p.dispose();
    this.composer?.dispose();
    this.composer = null;
  }
}

interface MeshDeformState {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  originalPosition: Float32Array;
  originalNormal: Float32Array | null;
}

function collectDeformableMeshStates(root: THREE.Object3D | null): MeshDeformState[] {
  const states: MeshDeformState[] = [];
  if (!root) return states;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    if (!(geometry instanceof THREE.BufferGeometry)) return;
    const positionAttr = geometry.attributes.position;
    if (!positionAttr) return;
    const originalPosition = new Float32Array(positionAttr.array.length);
    originalPosition.set(positionAttr.array as Float32Array);
    const normalAttr = geometry.attributes.normal;
    const originalNormal = normalAttr ? new Float32Array(normalAttr.array.length) : null;
    if (originalNormal) originalNormal.set(normalAttr.array as Float32Array);
    states.push({ mesh: child, geometry, originalPosition, originalNormal });
  });

  return states;
}

function applyVertexDeformation(
  state: MeshDeformState,
  callback: (orig: THREE.Vector3, result: THREE.Vector3) => void,
) {
  const positionAttr = state.geometry.attributes.position;
  const array = positionAttr.array as Float32Array;
  const tempOrig = new THREE.Vector3();
  const tempResult = new THREE.Vector3();

  for (let i = 0; i < array.length; i += 3) {
    tempOrig.set(
      state.originalPosition[i],
      state.originalPosition[i + 1],
      state.originalPosition[i + 2],
    );
    callback(tempOrig, tempResult);
    array[i] = tempResult.x;
    array[i + 1] = tempResult.y;
    array[i + 2] = tempResult.z;
  }

  positionAttr.needsUpdate = true;
  if (state.originalNormal && state.geometry.attributes.normal) {
    state.geometry.computeVertexNormals();
    state.geometry.attributes.normal.needsUpdate = true;
  }
}

function restoreDeformStates(states: MeshDeformState[]) {
  for (const state of states) {
    const positionAttr = state.geometry.attributes.position;
    const array = positionAttr.array as Float32Array;
    array.set(state.originalPosition);
    positionAttr.needsUpdate = true;
    if (state.originalNormal && state.geometry.attributes.normal) {
      (state.geometry.attributes.normal.array as Float32Array).set(state.originalNormal);
      state.geometry.attributes.normal.needsUpdate = true;
    }
  }
}

// ── FishEyePipe ───────────────────────────────────────────────────────────────
export interface FishEyePipeParams {
  strength?: number; // 0–1.0
  radius?: number;   // influence radius in world units
}

export class FishEyePipe implements EffectPipe {
  readonly name = 'fishEye';
  private states: MeshDeformState[] = [];
  constructor(public params: FishEyePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null) {
    this.states = collectDeformableMeshStates(mesh);
  }

  update(_ctx: PipeFrameContext) {
    const strength = this.params.strength ?? 0.35;
    const radius = Math.max(0.1, this.params.radius ?? 10);
    const radiusSq = radius * radius;

    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const dx = orig.x;
        const dy = orig.y;
        const r2 = dx * dx + dy * dy;
        if (r2 <= 0) {
          result.copy(orig);
          return;
        }

        const r = Math.sqrt(r2);
        const factor = 1 + strength * Math.exp(-r2 / radiusSq);
        const bulge = strength * 0.15 * (1 - Math.exp(-r / radius));

        result.set(
          dx * factor,
          dy * factor,
          orig.z + bulge,
        );
      });
    }
  }

  restoreGeometry() {
    restoreDeformStates(this.states);
  }

  dispose() {
    this.states = [];
  }
}

// ── BendPipe ──────────────────────────────────────────────────────────────────
export type BendPipeAxis = 'x' | 'y' | 'z';

export interface BendPipeParams {
  strength?: number; // 0–1
  axis?: BendPipeAxis;
}

export class BendPipe implements EffectPipe {
  readonly name = 'bend';
  private states: MeshDeformState[] = [];
  constructor(public params: BendPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null) {
    this.states = collectDeformableMeshStates(mesh);
  }

  update(_ctx: PipeFrameContext) {
    const strength = this.params.strength ?? 0.18;
    const axis = this.params.axis ?? 'x';
    if (strength === 0) return;

    const radius = Math.max(0.5, 1 / Math.max(0.001, strength));

    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const R = radius;
        if (axis === 'x') {
          const theta = orig.x / R;
          result.set(
            Math.sin(theta) * R,
            orig.y,
            R - Math.cos(theta) * R + orig.z,
          );
        } else if (axis === 'y') {
          const theta = orig.y / R;
          result.set(
            orig.x,
            Math.sin(theta) * R,
            R - Math.cos(theta) * R + orig.z,
          );
        } else {
          const theta = orig.z / R;
          result.set(
            R - Math.cos(theta) * R + orig.x,
            orig.y,
            Math.sin(theta) * R,
          );
        }
      });
    }
  }

  restoreGeometry() {
    restoreDeformStates(this.states);
  }

  dispose() {
    this.states = [];
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
    this.pass = new BokehPass(ctx.scene, ctx.camera, { focus, aperture, maxblur: maxBlur });
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

// ── RaysPipe (adds geometry rays around the mesh) ─────────────────────────────────
export interface RaysPipeParams {
  mode?: 'radial' | 'spaghetti' | 'chip';
  count?: number;
  innerThickness?: number;
  outerThickness?: number;
  innerMargin?: number;
  outerMargin?: number;
}

export class RaysPipe implements EffectPipe {
  readonly name = 'rays';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  constructor(public params: RaysPipeParams = {}) {}

  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!this.scene) return;
    if (this.group) { this.scene.remove(this.group); this.group = null; }
    if (!mesh) return;

    const mode = this.params.mode ?? 'radial';
    const rayCount = this.params.count ?? 24;
    const innerThickness = this.params.innerThickness ?? 0.06;
    const outerThickness = this.params.outerThickness ?? 0.08;
    const thickness = (innerThickness + outerThickness) / 2;
    const innerMargin = this.params.innerMargin ?? 2;
    const outerMargin = this.params.outerMargin ?? 6;

    const mainGroup = new THREE.Group();
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const depth = (mesh instanceof THREE.Mesh && (mesh.geometry as any).parameters?.height) ? (mesh as any).geometry.parameters.height * 0.5 : 0.5;

    if (mode === 'radial') {
      const halfDiag = Math.sqrt(size.x * size.x + size.y * size.y) / 2;
      const innerRadius = halfDiag + innerMargin;
      const outerRadius = halfDiag + innerMargin + outerMargin;
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const length = outerRadius - innerRadius;
        const rayGeo = new THREE.BoxGeometry(length, thickness, depth);
        const rayMesh = new THREE.Mesh(rayGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
        const midRadius = (innerRadius + outerRadius) / 2;
        rayMesh.position.set(center.x + cos * midRadius, center.y + sin * midRadius, center.z);
        rayMesh.rotation.z = angle;
        mainGroup.add(rayMesh);
      }
    } else if (mode === 'spaghetti') {
      const halfDiag = Math.sqrt(size.x * size.x + size.y * size.y) / 2;
      const innerRadius = halfDiag + innerMargin;
      const outerRadius = halfDiag + innerMargin + outerMargin;
      const seed = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5;
      for (let i = 0; i < rayCount; i++) {
        const baseAngle = (i / rayCount) * Math.PI * 2;
        const wobble = (seed(i) - 0.5) * 0.4;
        const angle = baseAngle + wobble;
        const lengthVariation = 0.5 + seed(i + 50);
        const thisOuter = innerRadius + (outerRadius - innerRadius) * lengthVariation;
        const length = thisOuter - innerRadius;
        const points: THREE.Vector3[] = [];
        const segments = 8;
        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          const r = innerRadius + length * t;
          const curveWobble = Math.sin(t * Math.PI * 2 + seed(i * 3) * 10) * 0.3;
          const a = angle + curveWobble * (1 - t * 0.5);
          points.push(new THREE.Vector3(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r, center.z));
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, 16, thickness * 0.5, 4, false);
        const rayMesh = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
        mainGroup.add(rayMesh);
      }
    } else if (mode === 'chip') {
      const halfW = size.x / 2 + innerMargin;
      const halfH = size.y / 2 + innerMargin;
      const outerHalfW = halfW + outerMargin;
      const outerHalfH = halfH + outerMargin;
      const perSide = Math.ceil(rayCount / 4);
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < perSide; i++) {
          const t = (i + 0.5) / perSide;
          let startX: number, startY: number, endX: number, endY: number;
          if (side === 0) { startX = center.x + (t - 0.5) * size.x; startY = center.y + halfH; endX = startX; endY = center.y + outerHalfH; }
          else if (side === 1) { startX = center.x + halfW; startY = center.y + (t - 0.5) * size.y; endX = center.x + outerHalfW; endY = startY; }
          else if (side === 2) { startX = center.x + (t - 0.5) * size.x; startY = center.y - halfH; endX = startX; endY = center.y - outerHalfH; }
          else { startX = center.x - halfW; startY = center.y + (t - 0.5) * size.y; endX = center.x - outerHalfW; endY = startY; }
          const len = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
          const rayGeo = new THREE.BoxGeometry(len, thickness, depth);
          const rayMesh = new THREE.Mesh(rayGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
          rayMesh.position.set((startX + endX) / 2, (startY + endY) / 2, center.z);
          rayMesh.rotation.z = Math.atan2(endY - startY, endX - startX);
          mainGroup.add(rayMesh);
        }
      }
    }

    this.group = mainGroup;
    this.scene.add(this.group);
  }

  update(_ctx: PipeFrameContext) {}

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null;
  }
}

// ── WavePipe (animated sinusoidal vertex deformation) ────────────────────────
export interface WavePipeParams {
  amplitude?: number; // displacement height (default 0.5)
  frequency?: number; // waves per unit length (default 1.0)
  speed?: number;     // animation speed in cycles/s (default 1.0)
  axis?: 'x' | 'y';  // wave propagation axis (default 'x')
}

export class WavePipe implements EffectPipe {
  readonly name = 'wave';
  private states: MeshDeformState[] = [];
  constructor(public params: WavePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null) {
    this.states = collectDeformableMeshStates(mesh);
  }

  update(ctx: PipeFrameContext) {
    const { amplitude = 0.5, frequency = 1.0, speed = 1.0, axis = 'x' } = this.params;
    const phase = ctx.time * speed * Math.PI * 2;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const wave = Math.sin((axis === 'x' ? orig.x : orig.y) * frequency * Math.PI * 2 + phase) * amplitude;
        result.set(orig.x, orig.y, orig.z + wave);
      });
    }
  }

  restoreGeometry() { restoreDeformStates(this.states); }
  dispose() { this.states = []; }
}

// ── TwistPipe (twist geometry around an axis) ─────────────────────────────────
export interface TwistPipeParams {
  strength?: number;      // radians per unit (default 0.3)
  axis?: 'x' | 'y' | 'z'; // twist axis (default 'y')
}

export class TwistPipe implements EffectPipe {
  readonly name = 'twist';
  private states: MeshDeformState[] = [];
  constructor(public params: TwistPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null) {
    this.states = collectDeformableMeshStates(mesh);
  }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.3, axis = 'y' } = this.params;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const t = axis === 'x' ? orig.x : axis === 'y' ? orig.y : orig.z;
        const angle = t * strength;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        if (axis === 'x') {
          result.set(orig.x, orig.y * cos - orig.z * sin, orig.y * sin + orig.z * cos);
        } else if (axis === 'y') {
          result.set(orig.x * cos - orig.z * sin, orig.y, orig.x * sin + orig.z * cos);
        } else {
          result.set(orig.x * cos - orig.y * sin, orig.x * sin + orig.y * cos, orig.z);
        }
      });
    }
  }

  restoreGeometry() { restoreDeformStates(this.states); }
  dispose() { this.states = []; }
}

// ── PulsePipe (animated scale pulsing) ────────────────────────────────────────
export interface PulsePipeParams {
  amplitude?: number; // scale pulsation depth 0–0.5 (default 0.12)
  speed?: number;     // pulses per second (default 1.0)
}

export class PulsePipe implements EffectPipe {
  readonly name = 'pulse';
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private baseScale = new THREE.Vector3(1, 1, 1);
  constructor(public params: PulsePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (mesh) this.baseScale.copy(mesh.scale);
  }

  update(ctx: PipeFrameContext) {
    if (!this.mesh) return;
    const { amplitude = 0.12, speed = 1.0 } = this.params;
    const scale = 1 + Math.sin(ctx.time * speed * Math.PI * 2) * amplitude;
    this.mesh.scale.set(this.baseScale.x * scale, this.baseScale.y * scale, this.baseScale.z * scale);
  }

  dispose() { this.mesh = null; }
}

// ── FloatingRingsPipe (torus rings orbiting the text) ─────────────────────────
export interface FloatingRingsPipeParams {
  count?: number;      // number of rings 1–6 (default 3)
  radiusMult?: number; // orbit radius relative to mesh half-size (default 1.6)
  speed?: number;      // rotation speed rev/s (default 0.25)
  thickness?: number;  // torus tube radius relative to mesh (default 0.04)
  color?: number;      // ring color (default 0xff8800)
}

export class FloatingRingsPipe implements EffectPipe {
  readonly name = 'floatingRings';
  private rings: THREE.Mesh[] = [];
  private scene: THREE.Scene | null = null;
  private meshRadius = 8;
  constructor(public params: FloatingRingsPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.buildRings();
  }

  private buildRings() {
    if (this.scene) for (const r of this.rings) { this.scene.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
    this.rings = [];
    const { count = 3, radiusMult = 1.6, thickness = 0.04, color = 0xff8800 } = this.params;
    const n = Math.min(6, Math.max(1, Math.round(count)));
    const torusRadius = this.meshRadius * radiusMult;
    const tubeRadius = this.meshRadius * thickness;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.TorusGeometry(torusRadius, tubeRadius, 8, 48);
      const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.2 });
      const mesh = new THREE.Mesh(geo, mat);
      this.rings.push(mesh);
      this.scene?.add(mesh);
    }
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    this.meshRadius = Math.max(size.x, size.y) / 2;
    this.buildRings();
  }

  update(ctx: PipeFrameContext) {
    const { count = 3, speed = 0.25 } = this.params;
    const n = Math.min(6, Math.max(1, Math.round(count)));
    if (n !== this.rings.length) { this.buildRings(); return; }
    for (let i = 0; i < this.rings.length; i++) {
      const offset = (i / this.rings.length) * Math.PI;
      const t = ctx.time * speed * Math.PI * 2;
      this.rings[i].rotation.x = t * 0.7 + offset;
      this.rings[i].rotation.y = t * 0.4 + offset * 1.3;
      this.rings[i].rotation.z = t * 0.2 + offset * 0.7;
    }
  }

  dispose() {
    if (this.scene) for (const r of this.rings) { this.scene.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
    this.rings = [];
  }
}

// ── VignettePipe (post-process corner darkening) ──────────────────────────────
const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset:   { value: 0.5 },
    darkness: { value: 1.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main(){
      vec4 color = texture2D(tDiffuse, vUv);
      float dist = distance(vUv, vec2(0.5));
      color.rgb *= smoothstep(0.8, offset * 0.799, dist * (darkness + offset));
      gl_FragColor = color;
    }
  `,
};

export interface VignettePipeParams {
  offset?:   number; // 0–1, how close to center the effect starts (default 0.5)
  darkness?: number; // 0–5, strength of darkening (default 1.0)
}

export class VignettePipe implements EffectPipe {
  readonly name = 'vignette';
  private pass: InstanceType<typeof ShaderPass> | null = null;
  constructor(public params: VignettePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new ShaderPass(vignetteShader as any);
    composer.addPass(this.pass);
    this.syncUniforms();
  }

  private syncUniforms() {
    if (!this.pass) return;
    this.pass.uniforms['offset'].value   = this.params.offset   ?? 0.5;
    this.pass.uniforms['darkness'].value = this.params.darkness ?? 1.0;
  }

  update(_ctx: PipeFrameContext) { this.syncUniforms(); }
  dispose() { this.pass = null; }
}

// ── ScanlinesPipe (post-process CRT scanlines) ────────────────────────────────
const scanlinesShader = {
  uniforms: {
    tDiffuse:    { value: null as THREE.Texture | null },
    count:       { value: 100.0 },
    intensity:   { value: 0.3 },
    scrollSpeed: { value: 0.0 },
    time:        { value: 0.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float count;
    uniform float intensity;
    uniform float scrollSpeed;
    uniform float time;
    varying vec2 vUv;
    void main(){
      vec4 color = texture2D(tDiffuse, vUv);
      float y = vUv.y + time * scrollSpeed;
      float line = sin(y * count * 3.14159265) * 0.5 + 0.5;
      color.rgb -= line * intensity;
      gl_FragColor = color;
    }
  `,
};

export interface ScanlinesPipeParams {
  count?:       number; // number of scanlines (default 100)
  intensity?:   number; // darkness 0–1 (default 0.3)
  scrollSpeed?: number; // scroll speed, 0 = static (default 0)
}

export class ScanlinesPipe implements EffectPipe {
  readonly name = 'scanlines';
  private pass: InstanceType<typeof ShaderPass> | null = null;
  constructor(public params: ScanlinesPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new ShaderPass(scanlinesShader as any);
    composer.addPass(this.pass);
    this.syncUniforms(0);
  }

  private syncUniforms(time: number) {
    if (!this.pass) return;
    this.pass.uniforms['count'].value       = this.params.count       ?? 100;
    this.pass.uniforms['intensity'].value   = this.params.intensity   ?? 0.3;
    this.pass.uniforms['scrollSpeed'].value = this.params.scrollSpeed ?? 0;
    this.pass.uniforms['time'].value        = time;
  }

  update(ctx: PipeFrameContext) { this.syncUniforms(ctx.time); }
  dispose() { this.pass = null; }
}

// ── ColorGradingPipe (post-process hue / saturation / contrast) ───────────────
const colorGradingShader = {
  uniforms: {
    tDiffuse:   { value: null as THREE.Texture | null },
    hueShift:   { value: 0.0 },
    saturation: { value: 1.0 },
    contrast:   { value: 1.0 },
    brightness: { value: 0.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float hueShift;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    varying vec2 vUv;

    vec3 rgb2hsl(vec3 c){
      float mx=max(max(c.r,c.g),c.b), mn=min(min(c.r,c.g),c.b);
      float h=0.,s=0.,l=(mx+mn)/2.;
      if(mx!=mn){ float d=mx-mn; s=l>0.5?d/(2.-mx-mn):d/(mx+mn);
        if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.:0.);
        else if(mx==c.g) h=(c.b-c.r)/d+2.;
        else h=(c.r-c.g)/d+4.; h/=6.; }
      return vec3(h,s,l);
    }
    float hue2rgb(float p,float q,float t){
      if(t<0.) t+=1.; if(t>1.) t-=1.;
      if(t<1./6.) return p+(q-p)*6.*t;
      if(t<1./2.) return q;
      if(t<2./3.) return p+(q-p)*(2./3.-t)*6.;
      return p;
    }
    vec3 hsl2rgb(vec3 c){
      if(c.y==0.) return vec3(c.z);
      float q=c.z<0.5?c.z*(1.+c.y):c.z+c.y-c.z*c.y, p=2.*c.z-q;
      return vec3(hue2rgb(p,q,c.x+1./3.),hue2rgb(p,q,c.x),hue2rgb(p,q,c.x-1./3.));
    }

    void main(){
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 hsl = rgb2hsl(tex.rgb);
      hsl.x = fract(hsl.x + hueShift);
      hsl.y = clamp(hsl.y * saturation, 0.0, 1.0);
      vec3 col = hsl2rgb(hsl);
      col = (col - 0.5) * contrast + 0.5 + brightness;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
    }
  `,
};

export interface ColorGradingPipeParams {
  hueShift?:   number; // 0–1, hue rotation (default 0)
  saturation?: number; // 0–3, saturation multiplier (default 1)
  contrast?:   number; // 0–3, contrast multiplier (default 1)
  brightness?: number; // -0.5 to 0.5 offset (default 0)
}

export class ColorGradingPipe implements EffectPipe {
  readonly name = 'colorGrading';
  private pass: InstanceType<typeof ShaderPass> | null = null;
  constructor(public params: ColorGradingPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new ShaderPass(colorGradingShader as any);
    composer.addPass(this.pass);
    this.syncUniforms();
  }

  private syncUniforms() {
    if (!this.pass) return;
    this.pass.uniforms['hueShift'].value   = this.params.hueShift   ?? 0;
    this.pass.uniforms['saturation'].value = this.params.saturation ?? 1;
    this.pass.uniforms['contrast'].value   = this.params.contrast   ?? 1;
    this.pass.uniforms['brightness'].value = this.params.brightness ?? 0;
  }

  update(_ctx: PipeFrameContext) { this.syncUniforms(); }
  dispose() { this.pass = null; }
}

// ── PixelatePipe (post-process pixelation) ────────────────────────────────────
const pixelateShader = {
  uniforms: {
    tDiffuse:   { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    pixelSize:  { value: 4.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;
    void main(){
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      gl_FragColor = texture2D(tDiffuse, coord);
    }
  `,
};

export interface PixelatePipeParams {
  pixelSize?: number; // pixels per cell (default 4)
}

export class PixelatePipe implements EffectPipe {
  readonly name = 'pixelate';
  private pass: InstanceType<typeof ShaderPass> | null = null;
  constructor(public params: PixelatePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, ctx: PipeSetupContext) {
    this.pass = new ShaderPass(pixelateShader as any);
    this.pass.uniforms['resolution'].value = new THREE.Vector2(ctx.width, ctx.height);
    this.pass.uniforms['pixelSize'].value  = this.params.pixelSize ?? 4;
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    this.pass.uniforms['pixelSize'].value = this.params.pixelSize ?? 4;
  }

  dispose() { this.pass = null; }
}

// ── RadialBlurPipe (post-process radial blur shader) ─────────────────────────
const radialBlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.5 },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    samples: { value: 8 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform vec2 center; uniform int samples; varying vec2 vUv; void main(){ vec2 dir = vUv - center; float dist = length(dir); vec4 acc = vec4(0.0); float total = 0.0; for(int i=0;i<32;i++){ if(i>=samples) break; float t = float(i)/float(samples-1); vec2 uv = vUv - dir * strength * t; acc += texture2D(tDiffuse, uv); total += 1.0; } gl_FragColor = acc/total; }`,
};

export interface RadialBlurPipeParams { strength?: number; samples?: number; center?: [number, number]; }

export class RadialBlurPipe implements EffectPipe {
  readonly name = 'radialBlur';
  private pass: InstanceType<typeof ShaderPass> | null = null;
  constructor(public params: RadialBlurPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new ShaderPass(radialBlurShader as any);
    composer.addPass(this.pass);
    this.update({} as any);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    this.pass.uniforms['strength'].value = this.params.strength ?? 0.15;
    this.pass.uniforms['samples'].value = Math.max(1, Math.min(32, Math.floor(this.params.samples ?? 8)));
    const c = this.params.center ?? [0.5, 0.5];
    this.pass.uniforms['center'].value = new THREE.Vector2(c[0], c[1]);
  }

  dispose() { this.pass = null; }
}
