import * as THREE from 'three';
import { makeRng } from './base';
import { schemeUniforms } from './fractal-background';

export type EnvMapStyle = 'gradient' | 'studio' | 'starfield' | 'sunset' | 'neon' | 'custom' | 'plasma';

export interface EnvMapPipeParams {
  style?: EnvMapStyle;
  seed?: number;
  intensity?: number;
  customImageDataUrl?: string;
  plasmaScheme?: string;
  plasmaSpeed?: number;
  plasmaScale?: number;
}

// ── GLSL ────────────────────────────────────────────────────────────────────

const PLASMA_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

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

// ── Pure builders ────────────────────────────────────────────────────────────

/** Builds a canvas-based procedural env texture (EquirectangularReflectionMapping). */
export function buildProceduralEnvTexture(
  style: Exclude<EnvMapStyle, 'custom' | 'plasma'>,
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

/** Builds an offscreen plasma ShaderMaterial. */
export function buildPlasmaMaterial(scheme: string, scale: number): THREE.ShaderMaterial {
  const stops = schemeUniforms(scheme);
  return new THREE.ShaderMaterial({
    vertexShader: PLASMA_VERT,
    fragmentShader: PLASMA_FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uZoom:      { value: scale },
      uStop0:     { value: stops.uStop0 },
      uStop1:     { value: stops.uStop1 },
      uStop2:     { value: stops.uStop2 },
      uStop3:     { value: stops.uStop3 },
      uStop4:     { value: stops.uStop4 },
      uStopCount: { value: stops.uStopCount },
    },
  });
}

/**
 * Stable string key identifying the required TextureSource variant.
 * Changing params within the same key (e.g. plasma speed) is handled
 * by the source's tick() — no recreation needed.
 */
export function textureSourceKey(params: EnvMapPipeParams): string {
  const { style = 'gradient', seed = 42, customImageDataUrl = '' } = params;
  if (style === 'plasma') return 'plasma';
  if (style === 'custom') return `custom:${customImageDataUrl}`;
  return `${style}:${seed}`;
}

// ── TextureSource interface ──────────────────────────────────────────────────

/**
 * Isolated, composable texture producer used by EnvMapPipe.
 *
 * envTexture  – PMREM-ready texture for scene.environment (PBR reflections)
 * mapTexture  – raw texture for the matcap shader sampler (null when unused)
 *
 * Implementations are fully isolated from the pipe's scene/mesh state.
 */
export interface TextureSource {
  readonly envTexture: THREE.Texture | null;
  readonly mapTexture: THREE.Texture | null;
  tick(delta: number, renderer: THREE.WebGLRenderer | null, params: EnvMapPipeParams): void;
  dispose(): void;
}

// ── Implementations ──────────────────────────────────────────────────────────

/** Wraps a synchronously built canvas texture. No per-frame work. */
export class StaticTextureSource implements TextureSource {
  readonly envTexture: THREE.Texture;
  readonly mapTexture = null;

  constructor(style: Exclude<EnvMapStyle, 'custom' | 'plasma'>, seed: number) {
    this.envTexture = buildProceduralEnvTexture(style, seed);
  }

  tick() {}
  dispose() { this.envTexture.dispose(); }
}

/** Renders plasma to a WebGLRenderTarget each frame; exposes the RT texture as mapTexture. */
export class PlasmaTextureSource implements TextureSource {
  readonly envTexture = null;
  get mapTexture(): THREE.Texture { return this.rt.texture; }

  private rt = new THREE.WebGLRenderTarget(256, 256);
  private offscreenScene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private geo = new THREE.PlaneGeometry(2, 2);
  private time = 0;

  constructor(scheme: string, scale: number) {
    this.mat = buildPlasmaMaterial(scheme, scale);
    this.offscreenScene.add(new THREE.Mesh(this.geo, this.mat));
  }

  tick(delta: number, renderer: THREE.WebGLRenderer | null, params: EnvMapPipeParams) {
    if (!renderer) return;
    this.time += delta * (params.plasmaSpeed ?? 1.0);
    const u = this.mat.uniforms;
    u.uTime.value = this.time;
    u.uZoom.value = params.plasmaScale ?? 8;
    const stops = schemeUniforms(params.plasmaScheme ?? 'psychedelic');
    u.uStop0.value = stops.uStop0; u.uStop1.value = stops.uStop1;
    u.uStop2.value = stops.uStop2; u.uStop3.value = stops.uStop3;
    u.uStop4.value = stops.uStop4; u.uStopCount.value = stops.uStopCount;

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
  const {
    style = 'gradient', seed = 42, customImageDataUrl = '',
    plasmaScheme = 'psychedelic', plasmaScale = 8,
  } = params;
  if (style === 'plasma') return new PlasmaTextureSource(plasmaScheme, plasmaScale);
  if (style === 'custom') return new CustomImageTextureSource(customImageDataUrl, renderer);
  return new StaticTextureSource(style, seed);
}
