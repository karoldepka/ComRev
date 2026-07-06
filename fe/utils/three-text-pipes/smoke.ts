import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface SmokePipeParams {
  count?: number;
  size?: number;
  speed?: number;
  opacity?: number;
  color?: number;
}

const VERT = /* glsl */`
attribute float aLife;
attribute float aSize;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  float sz = aSize * (1.0 + vLife * 2.8);
  gl_PointSize = max(1.5, sz * 380.0 / -mvPos.z);
  gl_Position = projectionMatrix * mvPos;
}`;

const FRAG = /* glsl */`
uniform float uOpacity;
uniform vec3 uColor;
varying float vLife;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float fadeIn  = smoothstep(0.0, 0.18, vLife);
  float fadeOut = smoothstep(1.0, 0.65, vLife);
  float alpha = fadeIn * fadeOut * smoothstep(1.0, 0.18, d) * uOpacity;
  float bright = mix(0.82, 0.28, vLife);
  gl_FragColor = vec4(uColor * bright, alpha);
}`;

export class SmokePipe implements EffectPipe {
  readonly name = 'smoke';
  private points: THREE.Points | null = null;
  private scene: THREE.Scene | null = null;
  private posAttr: THREE.BufferAttribute | null = null;
  private lifeAttr: THREE.BufferAttribute | null = null;
  private positions: Float32Array = new Float32Array(0);
  private lives: Float32Array = new Float32Array(0);
  private maxLives: Float32Array = new Float32Array(0);
  private vx: Float32Array = new Float32Array(0);
  private vy: Float32Array = new Float32Array(0);
  private vz: Float32Array = new Float32Array(0);
  private sizes: Float32Array = new Float32Array(0);
  private emitMinX = -3;
  private emitMaxX = 3;
  private emitTopY = 2;
  private emitZ = 0;
  private emitHalfD = 1;
  private mat: THREE.ShaderMaterial | null = null;

  constructor(public params: SmokePipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.build();
  }

  private build() {
    const { count = 70 } = this.params;
    const rng = makeRng(77);
    this.positions = new Float32Array(count * 3);
    this.lives     = new Float32Array(count);
    this.maxLives  = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.vz = new Float32Array(count);
    this.sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) this.spawnAt(i, rng());

    const geo = new THREE.BufferGeometry();
    this.posAttr  = new THREE.BufferAttribute(this.positions, 3);
    this.lifeAttr = new THREE.BufferAttribute(this.lives, 1);
    const sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aLife', this.lifeAttr);
    geo.setAttribute('aSize', sizeAttr);

    const col = new THREE.Color(this.params.color ?? 0x888888);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uOpacity: { value: this.params.opacity ?? 0.55 }, uColor: { value: col } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.scene?.add(this.points);
  }

  private spawnAt(i: number, lifePhase = 0) {
    const { speed = 1, size = 1.6 } = this.params;
    const w = this.emitMaxX - this.emitMinX;
    this.positions[i*3]   = this.emitMinX + Math.random() * w;
    this.positions[i*3+1] = this.emitTopY + (Math.random() - 0.5) * 0.6;
    this.positions[i*3+2] = this.emitZ + (Math.random() - 0.5) * this.emitHalfD * 2;
    const sp = speed * 0.4;
    this.vx[i] = (Math.random() - 0.5) * 0.35 * sp;
    this.vy[i] = (0.35 + Math.random() * 0.5) * sp;
    this.vz[i] = (Math.random() - 0.5) * 0.2 * sp;
    this.maxLives[i] = 1.8 + Math.random() * 1.6;
    this.lives[i] = lifePhase;
    this.sizes[i] = size * (0.5 + Math.random() * 0.8);
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!mesh) return;
    const bbox = new THREE.Box3().setFromObject(mesh);
    this.emitMinX  = bbox.min.x;
    this.emitMaxX  = bbox.max.x;
    this.emitTopY  = bbox.max.y + 0.3;
    this.emitZ     = (bbox.min.z + bbox.max.z) / 2;
    this.emitHalfD = (bbox.max.z - bbox.min.z) * 0.5;
  }

  update(ctx: PipeFrameContext) {
    if (!this.points || !this.posAttr || !this.lifeAttr || !this.mat) return;

    if (ctx.mesh) {
      const bbox = new THREE.Box3().setFromObject(ctx.mesh);
      this.emitMinX  = bbox.min.x;
      this.emitMaxX  = bbox.max.x;
      this.emitTopY  = bbox.max.y + 0.3;
      this.emitZ     = (bbox.min.z + bbox.max.z) / 2;
      this.emitHalfD = (bbox.max.z - bbox.min.z) * 0.5;
    }

    this.mat.uniforms.uOpacity.value = this.params.opacity ?? 0.55;

    const count = this.params.count ?? 70;
    const dt = Math.min(ctx.delta, 0.05);
    const t = ctx.time;

    for (let i = 0; i < count; i++) {
      this.lives[i] += dt / this.maxLives[i];
      if (this.lives[i] >= 1.0) { this.spawnAt(i, 0); continue; }
      const turbX = Math.sin(t * 0.9 + i * 0.61) * 0.008;
      this.positions[i*3]   += (this.vx[i] + turbX) * dt;
      this.positions[i*3+1] += this.vy[i] * dt;
      this.positions[i*3+2] += this.vz[i] * dt;
    }
    this.posAttr.needsUpdate  = true;
    this.lifeAttr.needsUpdate = true;
  }

  dispose() {
    if (this.points && this.scene) this.scene.remove(this.points);
    this.points?.geometry.dispose();
    this.mat?.dispose();
    this.points = null;
    this.mat = null;
  }
}
