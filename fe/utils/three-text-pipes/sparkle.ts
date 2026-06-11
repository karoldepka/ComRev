import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface SparklePipeParams { count?: number; color?: number; spread?: number; }

export class SparklePipe implements EffectPipe {
  readonly name = 'sparkle';
  private points: THREE.Points | null = null;
  private scene: THREE.Scene | null = null;
  private phases: Float32Array = new Float32Array(0);
  private baseAlpha: Float32Array = new Float32Array(0);

  constructor(public params: SparklePipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { count = 200, color = 0xffffaa, spread = 8 } = this.params;
    const rng = makeRng(42);
    const pos = new Float32Array(count * 3);
    this.phases = new Float32Array(count);
    this.baseAlpha = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i*3] = (rng() - 0.5) * spread * 2;
      pos[i*3+1] = (rng() - 0.5) * spread;
      pos[i*3+2] = (rng() - 0.5) * spread * 0.5;
      this.phases[i] = rng() * Math.PI * 2;
      this.baseAlpha[i] = 0.3 + rng() * 0.7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.12, transparent: true, opacity: 0.8 }));
    ctx.scene.add(this.points);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!this.points) return;
    const mat = this.points.material as THREE.PointsMaterial;
    mat.opacity = 0.4 + Math.sin(ctx.time * 3) * 0.4;
  }

  dispose() {
    if (this.points && this.scene) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    this.points = null;
  }
}
