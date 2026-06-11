import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface SnowPipeParams { count?: number; speed?: number; spread?: number; }

export class SnowPipe implements EffectPipe {
  readonly name = 'snow';
  private points: THREE.Points | null = null;
  private scene: THREE.Scene | null = null;
  private vx: Float32Array = new Float32Array(0);
  private vz: Float32Array = new Float32Array(0);
  private spread = 20;

  constructor(public params: SnowPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { count = 400, spread = 20 } = this.params;
    this.spread = spread;
    const rng = makeRng(42);
    const pos = new Float32Array(count * 3);
    this.vx = new Float32Array(count);
    this.vz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (rng() - 0.5) * spread * 2;
      pos[i*3+1] = (rng() - 0.5) * spread * 0.8;
      pos[i*3+2] = (rng() - 0.5) * spread;
      this.vx[i] = (rng() - 0.5) * 0.01;
      this.vz[i] = (rng() - 0.5) * 0.005;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.8 }));
    ctx.scene.add(this.points);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    if (!this.points) return;
    const speed = this.params.speed ?? 0.5;
    const count = this.params.count ?? 400;
    const pos = this.points.geometry.attributes.position.array as Float32Array;
    const spread = this.spread;
    for (let i = 0; i < count; i++) {
      pos[i*3]   += this.vx[i] * speed;
      pos[i*3+1] -= 0.04 * speed;
      pos[i*3+2] += this.vz[i] * speed;
      if (pos[i*3+1] < -spread * 0.8) pos[i*3+1] = spread * 0.8;
      if (Math.abs(pos[i*3]) > spread) pos[i*3] *= -0.9;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.points && this.scene) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    this.points = null;
  }
}
