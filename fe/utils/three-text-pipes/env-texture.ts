import * as THREE from 'three';
import { makeRng } from './base';
import { schemeUniforms } from './fractal-background';
import { FireworksState } from '../image-sources';

export type EnvMapStyle =
  | 'gradient' | 'studio' | 'starfield' | 'sunset' | 'neon'
  | 'plasma' | 'fire' | 'smoke' | 'noise' | 'fireworks'
  | 'custom';
export type EnvMapStyleParam = EnvMapStyle | 'none';

export interface EnvMapPipeParams {
  style?: EnvMapStyleParam;
  envMapStyle?: EnvMapStyleParam;
  seed?: number;
  intensity?: number;
  envMapIntensity?: number;
  customImageDataUrl?: string;
  envMapCustomDataUrl?: string;
  plasmaScheme?: string;
  plasmaSpeed?: number;
  plasmaScale?: number;
  fireworksScheme?: string;
  fireworksTrail?: number;
  fireworksCount?: number;
  /** Show the animated texture as scene.background (panoramic bg). Default true for animated styles. */
  showAsBackground?: boolean;
  /** Blur amount for scene.backgroundBlurriness (0–1). Default 0. */
  backgroundBlur?: number;
}

const ENV_MAP_STYLES = new Set<EnvMapStyleParam>([
  'none',
  'gradient',
  'studio',
  'starfield',
  'sunset',
  'neon',
  'plasma',
  'fire',
  'smoke',
  'noise',
  'fireworks',
  'custom',
]);

export function normalizeEnvMapPipeParams(params: EnvMapPipeParams): EnvMapPipeParams {
  const rawStyle = params.style ?? params.envMapStyle ?? 'gradient';
  const style = ENV_MAP_STYLES.has(rawStyle) ? rawStyle : 'gradient';
  return {
    ...params,
    style,
    intensity: params.intensity ?? params.envMapIntensity,
    customImageDataUrl: params.customImageDataUrl ?? params.envMapCustomDataUrl,
  };
}

// ── Shared vertex shader (used by all animated offscreen effects) ─────────────

const ANIM_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

// ── Fragment shaders ─────────────────────────────────────────────────────────

const PLASMA_FRAG = /* glsl */`
uniform float uTime;
uniform float uZoom;
uniform vec4  uStop0, uStop1, uStop2, uStop3, uStop4;
uniform int   uStopCount;
varying vec2  vUv;

vec3 palette(float t) {
  vec4 stops[5];
  stops[0]=uStop0; stops[1]=uStop1; stops[2]=uStop2; stops[3]=uStop3; stops[4]=uStop4;
  t=clamp(t,0.0,1.0);
  vec3 lo=stops[0].yzw, hi=stops[uStopCount-1].yzw;
  for(int i=0;i<4;i++){
    if(i>=uStopCount-1) break;
    float ta=stops[i].x, tb=stops[i+1].x;
    if(t>=ta && t<=tb){
      float f=(tb-ta)<0.0001?0.0:(t-ta)/(tb-ta);
      lo=stops[i].yzw; hi=stops[i+1].yzw;
      return mix(lo,hi,f);
    }
  }
  return mix(lo,hi,t);
}

void main() {
  float s=uZoom;
  float v =sin(vUv.x*s+uTime*1.4);
       v +=sin(vUv.y*s*0.9+uTime*1.1);
       v +=sin((vUv.x+vUv.y)*s*0.65+uTime*0.75);
       v +=sin(sqrt(pow(vUv.x-0.5,2.0)+pow(vUv.y-0.5,2.0))*s*2.5-uTime*1.2);
  float t=(sin(v*1.5)+1.0)*0.5;
  gl_FragColor=vec4(palette(t),1.0);
}
`;

// Shared fbm building block used by fire and smoke
const FBM_GLSL = /* glsl */`
float _hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float _noise(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(_hash(i),_hash(i+vec2(1,0)),f.x),
             mix(_hash(i+vec2(0,1)),_hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) {
  float v=0.0,a=0.5;
  for(int i=0;i<6;i++){ v+=a*_noise(p); p*=2.03; a*=0.47; }
  return v;
}
`;

const FIRE_FRAG = /* glsl */`
uniform float uTime;
uniform float uZoom;
varying vec2  vUv;
${FBM_GLSL}
void main() {
  // Tile vertically so fire fills the full height (wrap around for env-map use)
  vec2 p = vec2(vUv.x, fract(vUv.y + uTime * 0.18)) * uZoom;
  float n = clamp(fbm(p + 0.6*fbm(p + 0.6*fbm(p))), 0.0, 1.0);
  // Shift colour ramp so even moderate fbm values show orange/yellow
  vec3 col = mix(vec3(0.02,0.0,0.0), vec3(0.8,0.05,0.0),  smoothstep(0.00,0.20,n));
  col = mix(col, vec3(1.0,0.40,0.00), smoothstep(0.20,0.50,n));
  col = mix(col, vec3(1.0,0.85,0.10), smoothstep(0.50,0.72,n));
  col = mix(col, vec3(1.0,0.98,0.85), smoothstep(0.72,0.90,n));
  gl_FragColor = vec4(col, 1.0);
}
`;

const SMOKE_FRAG = /* glsl */`
uniform float uTime;
uniform float uZoom;
varying vec2  vUv;
${FBM_GLSL}
void main() {
  vec2 p = vUv * uZoom;
  p.y -= uTime * 0.28;                  // slow upward drift
  p.x += sin(uTime * 0.12) * 0.35;     // gentle sway
  float n = clamp(fbm(p + 0.7*fbm(p + 0.7*fbm(p))), 0.0, 1.0);
  vec3 col = mix(vec3(0.04,0.04,0.06), vec3(0.30,0.32,0.38), smoothstep(0.0,0.5,n));
  col = mix(col, vec3(0.60,0.62,0.68), smoothstep(0.5,0.8,n));
  col = mix(col, vec3(0.85,0.87,0.90), smoothstep(0.8,1.0,n));
  gl_FragColor = vec4(col, 1.0);
}
`;

const NOISE_FRAG = /* glsl */`
uniform float uTime;
uniform float uZoom;
varying vec2  vUv;
float rand(vec2 co, float seed) {
  return fract(sin(dot(co + seed, vec2(12.9898,78.233))) * 43758.5453);
}
float _nz(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(_nz(i),_nz(i+vec2(1,0)),f.x),
             mix(_nz(i+vec2(0,1)),_nz(i+vec2(1,1)),f.x),f.y);
}
void main() {
  // Fast-flickering coarse static grid blended with a slow drifting noise layer
  float frame  = floor(uTime * 24.0);
  float coarse = rand(floor(vUv * uZoom), frame);            // TV static
  float drift  = vnoise(vUv * uZoom * 0.5 + vec2(uTime * 0.3, uTime * 0.17));
  float n = mix(coarse, drift, 0.35);
  gl_FragColor = vec4(vec3(n), 1.0);
}
`;

// ── AnimatedShaderConfig ─────────────────────────────────────────────────────

interface AnimatedShaderConfig {
  fragShader: string;
  buildUniforms(): Record<string, THREE.IUniform>;
  /** time = total accumulated time (already scaled by speed). */
  updateUniforms(u: Record<string, THREE.IUniform>, time: number, params: EnvMapPipeParams): void;
}

const PLASMA_CONFIG: AnimatedShaderConfig = {
  fragShader: PLASMA_FRAG,
  buildUniforms() {
    const stops = schemeUniforms('psychedelic');
    return {
      uTime: { value: 0 }, uZoom: { value: 8 },
      uStop0: { value: stops.uStop0 }, uStop1: { value: stops.uStop1 },
      uStop2: { value: stops.uStop2 }, uStop3: { value: stops.uStop3 },
      uStop4: { value: stops.uStop4 }, uStopCount: { value: stops.uStopCount },
    };
  },
  updateUniforms(u, time, params) {
    u.uTime.value = time;
    u.uZoom.value = params.plasmaScale ?? 8;
    const stops = schemeUniforms(params.plasmaScheme ?? 'psychedelic');
    u.uStop0.value = stops.uStop0; u.uStop1.value = stops.uStop1;
    u.uStop2.value = stops.uStop2; u.uStop3.value = stops.uStop3;
    u.uStop4.value = stops.uStop4; u.uStopCount.value = stops.uStopCount;
  },
};

const FIRE_CONFIG: AnimatedShaderConfig = {
  fragShader: FIRE_FRAG,
  buildUniforms: () => ({ uTime: { value: 0 }, uZoom: { value: 4 } }),
  updateUniforms(u, time, params) {
    u.uTime.value = time;
    u.uZoom.value = params.plasmaScale ?? 4;
  },
};

const SMOKE_CONFIG: AnimatedShaderConfig = {
  fragShader: SMOKE_FRAG,
  buildUniforms: () => ({ uTime: { value: 0 }, uZoom: { value: 3 } }),
  updateUniforms(u, time, params) {
    u.uTime.value = time;
    u.uZoom.value = params.plasmaScale ?? 3;
  },
};

const NOISE_CONFIG: AnimatedShaderConfig = {
  fragShader: NOISE_FRAG,
  buildUniforms: () => ({ uTime: { value: 0 }, uZoom: { value: 32 } }),
  updateUniforms(u, time, params) {
    u.uTime.value = time;
    u.uZoom.value = params.plasmaScale ?? 32;
  },
};

const ANIMATED_CONFIGS: Partial<Record<EnvMapStyle, AnimatedShaderConfig>> = {
  plasma: PLASMA_CONFIG,
  fire:   FIRE_CONFIG,
  smoke:  SMOKE_CONFIG,
  noise:  NOISE_CONFIG,
};

// ── Pure builders ────────────────────────────────────────────────────────────

/** Builds a canvas-based procedural env texture (EquirectangularReflectionMapping). */
export function buildProceduralEnvTexture(
  style: Exclude<EnvMapStyle, 'custom' | 'plasma' | 'fire' | 'smoke' | 'noise'>,
  seed: number,
): THREE.Texture {
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

/**
 * Cache key identifying the required TextureSource variant.
 * Param changes within the same key (speed/scale/scheme) are handled by tick().
 */
export function textureSourceKey(params: EnvMapPipeParams): string {
  const { style = 'gradient', seed = 42, customImageDataUrl = '' } = normalizeEnvMapPipeParams(params);
  if (style === 'none') return 'none';
  if (style in (ANIMATED_CONFIGS as object) || style === 'fireworks') return style;
  if (style === 'custom') return `custom:${customImageDataUrl}`;
  return `${style}:${seed}`;
}

// ── TextureSource interface ──────────────────────────────────────────────────

/**
 * Isolated, composable texture producer used by EnvMapPipe.
 *
 * envTexture  – PMREM-ready for scene.environment (PBR reflections)
 * mapTexture  – raw texture for the matcap shader sampler (null when unused)
 */
export interface TextureSource {
  readonly envTexture: THREE.Texture | null;
  readonly mapTexture: THREE.Texture | null;
  tick(delta: number, renderer: THREE.WebGLRenderer | null, params: EnvMapPipeParams): void;
  dispose(): void;
}

// ── Implementations ──────────────────────────────────────────────────────────

export class EmptyTextureSource implements TextureSource {
  readonly envTexture = null;
  readonly mapTexture = null;
  tick() {}
  dispose() {}
}

/** Wraps a synchronously built canvas texture. No per-frame work. */
export class StaticTextureSource implements TextureSource {
  readonly envTexture: THREE.Texture;
  readonly mapTexture = null;

  constructor(style: Exclude<EnvMapStyle, 'custom' | 'plasma' | 'fire' | 'smoke' | 'noise'>, seed: number) {
    this.envTexture = buildProceduralEnvTexture(style, seed);
  }

  tick() {}
  dispose() { this.envTexture.dispose(); }
}

/**
 * Renders an animated GLSL shader to an offscreen RenderTarget each frame.
 * Exposes the RT texture as both envTexture (equirect PBR env-map + scene.background)
 * and mapTexture (matcap sampler injected into MeshStandardMaterial).
 * All animated env-map styles (plasma, fire, smoke, noise) use this class.
 */
export class AnimatedShaderSource implements TextureSource {
  get envTexture(): THREE.Texture { return this.rt.texture; }
  get mapTexture(): THREE.Texture { return this.rt.texture; }

  private rt: THREE.WebGLRenderTarget;
  private offscreenScene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private geo = new THREE.PlaneGeometry(2, 2);
  private time = 0;

  constructor(private config: AnimatedShaderConfig) {
    this.rt = new THREE.WebGLRenderTarget(512, 512);
    // EquirectangularReflectionMapping enables the RT texture to be used as both
    // scene.environment (PBR IBL reflections) and scene.background (panoramic bg).
    this.rt.texture.mapping = THREE.EquirectangularReflectionMapping;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: ANIM_VERT,
      fragmentShader: config.fragShader,
      uniforms: config.buildUniforms(),
    });
    this.offscreenScene.add(new THREE.Mesh(this.geo, this.mat));
  }

  tick(delta: number, renderer: THREE.WebGLRenderer | null, params: EnvMapPipeParams) {
    if (!renderer) return;
    this.time += delta * (params.plasmaSpeed ?? 1.0);
    this.config.updateUniforms(this.mat.uniforms, this.time, params);

    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.offscreenScene, this.camera);
    renderer.setRenderTarget(prevRT);
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.rt.dispose();
  }
}

/**
 * Runs the canvas-based FireworksState simulation each frame and exposes the
 * result via a THREE.CanvasTexture (matcap sampler input).
 */
export class FireworksTextureSource implements TextureSource {
  readonly envTexture = null;
  readonly mapTexture: THREE.Texture;
  private canvas: HTMLCanvasElement;
  private state = new FireworksState();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 256;
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 256, 256);
    this.mapTexture = new THREE.CanvasTexture(this.canvas);
  }

  tick(delta: number, _renderer: THREE.WebGLRenderer | null, params: EnvMapPipeParams) {
    const fwParams = {
      scheme: params.fireworksScheme ?? 'neon',
      trailAlpha: params.fireworksTrail ?? 0.15,
      particleCount: params.fireworksCount ?? 120,
    };
    this.state.update(256, 256, delta, fwParams);
    this.state.render(this.canvas, fwParams);
    (this.mapTexture as THREE.CanvasTexture).needsUpdate = true;
  }

  dispose() { this.mapTexture.dispose(); }
}

/**
 * Async-loads a data URL, producing a matcap map and a PMREM env texture.
 * Textures become available on the next frame after loading completes.
 */
export class CustomImageTextureSource implements TextureSource {
  envTexture: THREE.Texture | null = null;
  mapTexture: THREE.Texture | null = null;
  private loading = false;

  constructor(dataUrl: string, renderer: THREE.WebGLRenderer | null) {
    this._load(dataUrl, renderer);
  }

  private _load(dataUrl: string, renderer: THREE.WebGLRenderer | null) {
    if (!dataUrl || this.loading) return;
    this.loading = true;
    new THREE.TextureLoader().load(
      dataUrl,
      (tex) => {
        this.loading = false;
        // Clone before PMREM so we keep the raw image for the matcap sampler.
        const mapTex = tex.clone();
        mapTex.colorSpace = THREE.SRGBColorSpace;
        mapTex.needsUpdate = true;

        let envTex: THREE.Texture;
        if (renderer) {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          envTex = pmrem.fromEquirectangular(tex).texture;
          pmrem.dispose();
          tex.dispose();
        } else {
          tex.colorSpace = THREE.LinearSRGBColorSpace;
          tex.mapping = THREE.EquirectangularReflectionMapping;
          envTex = tex;
        }

        this.envTexture?.dispose();
        this.mapTexture?.dispose();
        this.envTexture = envTex;
        this.mapTexture = mapTex;
      },
      undefined,
      (err) => {
        this.loading = false;
        console.error('CustomImageTextureSource: failed to load image', err);
      },
    );
  }

  tick() {}

  dispose() {
    this.envTexture?.dispose();
    this.mapTexture?.dispose();
    this.envTexture = null;
    this.mapTexture = null;
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createTextureSource(
  params: EnvMapPipeParams,
  renderer: THREE.WebGLRenderer | null,
): TextureSource {
  const { style = 'gradient', seed = 42, customImageDataUrl = '' } = normalizeEnvMapPipeParams(params);

  if (style === 'none') {
    return new EmptyTextureSource();
  }

  const animConfig = ANIMATED_CONFIGS[style];
  if (animConfig) return new AnimatedShaderSource(animConfig);

  if (style === 'fireworks') return new FireworksTextureSource();

  if (style === 'custom') return new CustomImageTextureSource(customImageDataUrl, renderer);

  return new StaticTextureSource(
    style as Exclude<EnvMapStyle, 'custom' | 'plasma' | 'fire' | 'smoke' | 'noise'>,
    seed,
  );
}
