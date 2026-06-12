import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export type SkyStyle = 'day' | 'sunset' | 'night' | 'nebula' | 'aurora';

export interface SkySpherePipeParams {
  style?: SkyStyle;
  turbidity?: number; // 0..1, haze
}

interface SkyColors { zenith: number; horizon: number; nadir: number }

const STYLE_COLORS: Record<SkyStyle, SkyColors> = {
  day:    { zenith: 0x1a6fc4, horizon: 0xbbd9f0, nadir: 0x4a7c42 },
  sunset: { zenith: 0x0a1a3d, horizon: 0xe8522a, nadir: 0x3d2a0d },
  night:  { zenith: 0x03051a, horizon: 0x0c1430, nadir: 0x050508 },
  nebula: { zenith: 0x0d0525, horizon: 0x2a1055, nadir: 0x050310 },
  aurora: { zenith: 0x020d12, horizon: 0x062018, nadir: 0x020508 },
};

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(vec3(modelMatrix * vec4(position, 0.0)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uNadir;
uniform int  uStyle; // 0=day,1=sunset,2=night,3=nebula,4=aurora
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

void main() {
  float t = vDir.y; // -1..1
  vec3 col;
  if (t >= 0.0) col = mix(uHorizon, uZenith, sqrt(t));
  else          col = mix(uHorizon, uNadir,  sqrt(-t));

  // Stars (night/nebula)
  if (uStyle == 2 || uStyle == 3) {
    float star = step(0.996, hash(floor(vDir.xz * 400.0 + vDir.y * 200.0)));
    star *= smoothstep(0.0, 0.35, t);
    float twinkle = 0.7 + 0.3 * sin(uTime * 3.1 + hash(floor(vDir.xz * 300.0)) * 6.28);
    col += vec3(star * twinkle * 0.9);
  }

  // Nebula color clouds
  if (uStyle == 3) {
    vec2 uv = vec2(atan(vDir.z, vDir.x) / 6.283, asin(clamp(vDir.y,-1.0,1.0)) / 3.14159 + 0.5);
    float n1 = noise(uv * 6.0 + uTime * 0.03);
    float n2 = noise(uv * 12.0 - uTime * 0.02);
    float nb = n1 * n2 * smoothstep(0.0, 0.6, t);
    col += vec3(nb * 0.55, nb * 0.12, nb * 0.7);
  }

  // Aurora
  if (uStyle == 4) {
    float yt = t * 0.5 + 0.5;
    float aurora = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float wave = sin(vDir.x * (4.0 + fi * 1.5) + uTime * (0.25 + fi * 0.07))
                 * sin(vDir.z * (3.0 + fi)        + uTime * (0.18 + fi * 0.06));
      float band = smoothstep(0.45, 0.58, yt + wave * 0.08) * smoothstep(0.92, 0.72, yt + wave * 0.08);
      aurora += band * (0.4 + fi * 0.15);
    }
    col += vec3(0.0, aurora * 0.75, aurora * 0.35) + vec3(aurora * 0.05, 0.0, aurora * 0.2);
  }

  gl_FragColor = vec4(col, 1.0);
}`;

export class SkySpherePipe implements EffectPipe {
  readonly name = 'skySphere';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private camPos = new THREE.Vector3();

  constructor(public params: SkySpherePipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const style: SkyStyle = this.params.style ?? 'day';
    const colors = STYLE_COLORS[style];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uZenith:  { value: new THREE.Color(colors.zenith) },
        uHorizon: { value: new THREE.Color(colors.horizon) },
        uNadir:   { value: new THREE.Color(colors.nadir) },
        uStyle:   { value: this.styleIndex(style) },
        uTime:    { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const geo = new THREE.SphereGeometry(180, 32, 16);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    ctx.scene.add(this.mesh);
  }

  private styleIndex(style: SkyStyle): number {
    return ['day','sunset','night','nebula','aurora'].indexOf(style);
  }

  update(ctx: PipeFrameContext) {
    if (!this.mat || !this.mesh) return;
    const style: SkyStyle = this.params.style ?? 'day';
    const colors = STYLE_COLORS[style];
    this.mat.uniforms.uZenith.value.set(colors.zenith);
    this.mat.uniforms.uHorizon.value.set(colors.horizon);
    this.mat.uniforms.uNadir.value.set(colors.nadir);
    this.mat.uniforms.uStyle.value = this.styleIndex(style);
    this.mat.uniforms.uTime.value = ctx.time;
    // Follow camera so horizon is always correct
    ctx.camera.getWorldPosition(this.camPos);
    this.mesh.position.copy(this.camPos);
  }

  dispose() {
    if (this.mesh && this.scene) this.scene.remove(this.mesh);
    this.mesh?.geometry.dispose();
    this.mat?.dispose();
    this.mesh = null;
    this.mat = null;
  }
}
