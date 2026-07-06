import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface FirePipeParams {
  count?: number;
  size?: number;
  speed?: number;
  spread?: number;
}

const VERT = /* glsl */`
attribute float aLife;
attribute float aSize;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.5, aSize * 300.0 / -mvPos.z);
  gl_Position = projectionMatrix * mvPos;
}`;

const FRAG = /* glsl */`
varying float vLife;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float alpha = (1.0 - vLife) * smoothstep(1.0, 0.12, d);
  vec3 col;
  if (vLife < 0.2)       col = mix(vec3(1.0,1.0,0.88),  vec3(1.0,0.88,0.08), vLife * 5.0);
  else if (vLife < 0.55) col = mix(vec3(1.0,0.88,0.08), vec3(1.0,0.28,0.02), (vLife-0.2)/0.35);
  else                   col = mix(vec3(1.0,0.28,0.02), vec3(0.42,0.0,0.0),  (vLife-0.55)/0.45);
  gl_FragColor = vec4(col * alpha * 1.9, alpha);
}`;

export class FirePipe implements EffectPipe {
  readonly name = 'fire';
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
  private emitBaseY = 0;
  private emitZ = 0;
  private emitHalfD = 1;
  private tmp = new THREE.Vector3();

  constructor(public params: FirePipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.build();
  }

  private build() {
    const { count = 280 } = this.params;
    const rng = makeRng(42);
    this.positions = new Float32Array(count * 3);
    this.lives     = new Float32Array(count);
    this.maxLives  = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.vz = new Float32Array(count);
    this.sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) this.spawnAt(i, rng() /* random initial phase */);

    const geo = new THREE.BufferGeometry();
    this.posAttr  = new THREE.BufferAttribute(this.positions, 3);
    this.lifeAttr = new THREE.BufferAttribute(this.lives, 1);
    const sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aLife', this.lifeAttr);
    geo.setAttribute('aSize', sizeAttr);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.scene?.add(this.points);
  }

  private spawnAt(i: number, lifePhase = 0) {
    const { speed = 1, size = 0.85, spread = 1 } = this.params;
    const w = this.emitMaxX - this.emitMinX;
    this.positions[i*3]   = this.emitMinX + Math.random() * w;
    this.positions[i*3+1] = this.emitBaseY + (Math.random() - 0.5) * 0.4;
    this.positions[i*3+2] = this.emitZ + (Math.random() - 0.5) * this.emitHalfD * 2 * spread;
    this.vx[i] = (Math.random() - 0.5) * 0.55 * speed;
    this.vy[i] = (0.9 + Math.random() * 1.1) * speed;
    this.vz[i] = (Math.random() - 0.5) * 0.25 * speed;
    this.maxLives[i] = 0.5 + Math.random() * 0.9;
    this.lives[i] = lifePhase;
    this.sizes[i] = size * (0.45 + Math.random() * 0.75);
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!mesh) return;
    const bbox = new THREE.Box3().setFromObject(mesh);
    mesh.getWorldPosition(this.tmp);
    this.emitMinX = bbox.min.x;
    this.emitMaxX = bbox.max.x;
    this.emitBaseY = bbox.min.y;
    this.emitZ = (bbox.min.z + bbox.max.z) / 2;
    this.emitHalfD = (bbox.max.z - bbox.min.z) * 0.5;
  }

  update(ctx: PipeFrameContext) {
    if (!this.points || !this.posAttr || !this.lifeAttr) return;

    // Follow mesh if it animates
    if (ctx.mesh) {
      const bbox = new THREE.Box3().setFromObject(ctx.mesh);
      this.emitMinX  = bbox.min.x;
      this.emitMaxX  = bbox.max.x;
      this.emitBaseY = bbox.min.y;
      this.emitZ     = (bbox.min.z + bbox.max.z) / 2;
      this.emitHalfD = (bbox.max.z - bbox.min.z) * 0.5;
    }

    const count = this.params.count ?? 280;
    const dt = Math.min(ctx.delta, 0.05);
    const t = ctx.time;

    for (let i = 0; i < count; i++) {
      this.lives[i] += dt / this.maxLives[i];
      if (this.lives[i] >= 1.0) { this.spawnAt(i, 0); continue; }
      const turbX = Math.sin(t * 2.4 + i * 0.73) * 0.018;
      const turbZ = Math.cos(t * 1.9 + i * 1.17) * 0.012;
      this.positions[i*3]   += (this.vx[i] + turbX) * dt;
      this.positions[i*3+1] += this.vy[i] * dt * (1.0 - this.lives[i] * 0.35);
      this.positions[i*3+2] += (this.vz[i] + turbZ) * dt;
    }
    this.posAttr.needsUpdate  = true;
    this.lifeAttr.needsUpdate = true;
  }

  dispose() {
    if (this.points && this.scene) this.scene.remove(this.points);
    this.points?.geometry.dispose();
    (this.points?.material as THREE.Material)?.dispose();
    this.points = null;
  }
}
