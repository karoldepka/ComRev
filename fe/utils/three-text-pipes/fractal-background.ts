import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export type FractalType = 'mandelbrot' | 'julia' | 'burningShip' | 'tricorn' | 'plasma';

export interface FractalBackgroundPipeParams {
  fractalType?: FractalType;
  scheme?: 'psychedelic' | 'fire' | 'ice' | 'electric' | 'forest' | 'ocean' | 'sunset' | 'neon' | 'lava' | 'grayscale';
  maxIter?: number;
  zoom?: number;
  cx?: number;
  cy?: number;
  juliaRe?: number;
  juliaIm?: number;
  animateJulia?: boolean;
  juliaSpeed?: number;
  width?: number;
  height?: number;
  offsetZ?: number;
}

// Color scheme stop data packed as [r,g,b, r,g,b, ...] with t values embedded.
// We encode each scheme as 5 control points: t0,r0,g0,b0, t1,...
export const SCHEME_STOPS: Record<string, number[]> = {
  psychedelic: [0,1,0,0.5, 0.25,0,1,0.78, 0.5,0.5,0,1, 0.75,1,0.78,0, 1,1,0,0.5],
  fire:        [0,0,0,0, 0.33,0.86,0,0, 0.66,1,0.65,0, 1,1,1,0.78],
  ice:         [0,0,0,0.16, 0.5,0,0.47,0.86, 1,0.78,0.94,1],
  electric:    [0,0,0,0, 0.4,0,0.31,1, 0.7,0.47,0,1, 1,1,1,1],
  forest:      [0,0,0.08,0, 0.5,0,0.55,0.16, 1,0.71,0.9,0.31],
  ocean:       [0,0,0,0.16, 0.4,0,0.24,0.71, 0.7,0,0.63,0.78, 1,0.63,0.9,1],
  sunset:      [0,0.04,0,0.12, 0.3,0.78,0,0.31, 0.6,1,0.47,0, 0.85,1,0.86,0.31, 1,1,1,0.86],
  neon:        [0,0,0,0, 0.25,0,1,0.47, 0.5,1,0,1, 0.75,0,0.78,1, 1,1,1,0],
  lava:        [0,0.04,0,0, 0.3,0.71,0.08,0, 0.6,1,0.39,0, 0.85,1,0.94,0.31, 1,1,1,1],
  grayscale:   [0,0,0,0, 1,1,1,1],
};

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// palette: 5 stops × (t, r, g, b)
const FRAG = /* glsl */`
uniform int   uType;      // 0=mandelbrot 1=julia 2=burningShip 3=tricorn 4=plasma
uniform int   uMaxIter;
uniform float uZoom;
uniform float uCx;
uniform float uCy;
uniform float uJuliRe;
uniform float uJuliIm;
uniform float uTime;

// up to 5 palette stops: [t,r,g,b]  packed as vec4
uniform vec4 uStop0;
uniform vec4 uStop1;
uniform vec4 uStop2;
uniform vec4 uStop3;
uniform vec4 uStop4;
uniform int  uStopCount;

varying vec2 vUv;

vec3 palette(float t) {
  vec4 stops[5];
  stops[0] = uStop0; stops[1] = uStop1; stops[2] = uStop2;
  stops[3] = uStop3; stops[4] = uStop4;
  t = clamp(t, 0.0, 1.0);
  vec3 lo = stops[0].yzw, hi = stops[uStopCount-1].yzw;
  for (int i = 0; i < 4; i++) {
    if (i >= uStopCount - 1) break;
    float ta = stops[i].x, tb = stops[i+1].x;
    if (t >= ta && t <= tb) {
      float f = (tb - ta) < 0.0001 ? 0.0 : (t - ta) / (tb - ta);
      lo = stops[i].yzw; hi = stops[i+1].yzw;
      return mix(lo, hi, f);
    }
  }
  return mix(lo, hi, t);
}

void main() {
  if (uType == 4) {
    // Plasma
    vec2 uv = vUv;
    float scale = uZoom; // reuse zoom as scale
    float v  = sin(uv.x * scale + uTime * 1.4);
         v += sin(uv.y * scale * 0.9 + uTime * 1.1);
         v += sin((uv.x + uv.y) * scale * 0.65 + uTime * 0.75);
         v += sin(sqrt(pow(uv.x - 0.5, 2.0) + pow(uv.y - 0.5, 2.0)) * scale * 2.5 - uTime * 1.2);
    float t = (sin(v * 1.5) + 1.0) * 0.5;
    gl_FragColor = vec4(palette(t), 1.0);
    return;
  }

  // Fractal: map uv to complex plane
  float aspect = 1.0; // plane is square
  vec2 c;
  float zoomInv = 1.0 / max(uZoom, 0.001);
  c.x = (vUv.x - 0.5) * 3.5 * zoomInv + uCx;
  c.y = (vUv.y - 0.5) * 3.5 * zoomInv + uCy;

  vec2 z = (uType == 1) ? c : vec2(0.0);       // julia starts at c
  vec2 seed = (uType == 1) ? vec2(uJuliRe, uJuliIm) : c;

  int iter = 0;
  for (int i = 0; i < 512; i++) {
    if (i >= uMaxIter) break;
    float x = z.x, y = z.y;
    if (uType == 2) { x = abs(x); y = abs(y); }  // burning ship
    if (uType == 3) { y = -y; }                   // tricorn (conjugate)
    z = vec2(x*x - y*y + seed.x, 2.0*x*y + seed.y);
    if (dot(z,z) > 4.0) { iter = i; break; }
    iter = i;
  }

  if (iter >= uMaxIter - 1) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Smooth colouring
  float smooth_iter = float(iter) + 1.0 - log2(log2(dot(z,z)));
  float t = smooth_iter / float(uMaxIter);
  // Cycle the palette a few times for richer colour bands
  t = fract(t * 3.0);
  gl_FragColor = vec4(palette(t), 1.0);
}`;

export function schemeUniforms(schemeName: string): {
  uStop0: THREE.Vector4; uStop1: THREE.Vector4; uStop2: THREE.Vector4;
  uStop3: THREE.Vector4; uStop4: THREE.Vector4; uStopCount: number;
} {
  const data = SCHEME_STOPS[schemeName] ?? SCHEME_STOPS.psychedelic;
  const n = data.length / 4;
  const toVec4 = (base: number) => base < data.length
    ? new THREE.Vector4(data[base], data[base+1], data[base+2], data[base+3])
    : new THREE.Vector4(0, 0, 0, 0);
  return {
    uStop0: toVec4(0), uStop1: toVec4(4), uStop2: toVec4(8),
    uStop3: toVec4(12), uStop4: toVec4(16), uStopCount: n,
  };
}

function typeIndex(t: FractalType): number {
  return ['mandelbrot','julia','burningShip','tricorn','plasma'].indexOf(t);
}

export class FractalBackgroundPipe implements EffectPipe {
  readonly name = 'fractalBackground';
  private mesh: THREE.Mesh | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private scene: THREE.Scene | null = null;
  private juliaAngle = 0;

  constructor(public params: FractalBackgroundPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this._build(ctx);
  }

  private _build(ctx: PipeSetupContext) {
    if (this.mesh) {
      ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    const {
      fractalType = 'mandelbrot', scheme = 'psychedelic',
      maxIter = 128, zoom = 0.35, cx = -0.5, cy = 0,
      juliaRe = -0.7, juliaIm = 0.27,
      width = 60, height = 40, offsetZ = -8,
    } = this.params;

    // For plasma, zoom acts as scale. Default fractal zoom (0.35) looks nearly invisible for plasma.
    const effectiveZoom = fractalType === 'plasma' && zoom < 2 ? 8.0 : zoom;

    const stops = schemeUniforms(scheme);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uType:      { value: typeIndex(fractalType) },
        uMaxIter:   { value: maxIter },
        uZoom:      { value: effectiveZoom },
        uCx:        { value: cx },
        uCy:        { value: cy },
        uJuliRe:    { value: juliaRe },
        uJuliIm:    { value: juliaIm },
        uTime:      { value: 0 },
        uStop0:     { value: stops.uStop0 },
        uStop1:     { value: stops.uStop1 },
        uStop2:     { value: stops.uStop2 },
        uStop3:     { value: stops.uStop3 },
        uStop4:     { value: stops.uStop4 },
        uStopCount: { value: stops.uStopCount },
      },
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(width, height);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.z = offsetZ;
    this.mesh.renderOrder = -10;
    ctx.scene.add(this.mesh);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!this.mat || !this.mesh) return;
    const {
      fractalType = 'mandelbrot', scheme = 'psychedelic',
      maxIter = 128, zoom = 0.35, cx = -0.5, cy = 0,
      juliaRe = -0.7, juliaIm = 0.27,
      animateJulia = true, juliaSpeed = 0.3, offsetZ = -8,
    } = this.params;

    const u = this.mat.uniforms;
    u.uType.value = typeIndex(fractalType);
    u.uMaxIter.value = maxIter;
    u.uZoom.value = fractalType === 'plasma' && zoom < 2 ? 8.0 : zoom;
    u.uCx.value = cx;
    u.uCy.value = cy;
    u.uTime.value = ctx.time;

    // Animate Julia params along a circle for a hypnotic morphing effect
    if (fractalType === 'julia' && animateJulia) {
      this.juliaAngle += ctx.delta * juliaSpeed * 0.4;
      const r = 0.7885;
      u.uJuliRe.value = r * Math.cos(this.juliaAngle);
      u.uJuliIm.value = r * Math.sin(this.juliaAngle);
    } else {
      u.uJuliRe.value = juliaRe;
      u.uJuliIm.value = juliaIm;
    }

    const stops = schemeUniforms(scheme);
    u.uStop0.value = stops.uStop0; u.uStop1.value = stops.uStop1;
    u.uStop2.value = stops.uStop2; u.uStop3.value = stops.uStop3;
    u.uStop4.value = stops.uStop4; u.uStopCount.value = stops.uStopCount;

    this.mesh.position.z = offsetZ;
  }

  dispose() {
    if (this.mesh && this.scene) this.scene.remove(this.mesh);
    this.mesh?.geometry.dispose();
    this.mat?.dispose();
    this.mesh = null;
    this.mat = null;
  }
}
