import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface StarField3dPipeParams { count?: number; speed?: number; spread?: number; color?: number; }

export class StarField3dPipe implements EffectPipe {
  readonly name = 'starField3d';
  private points: THREE.Points | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: StarField3dPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { count = 800, spread = 30, color = 0xffffff } = this.params;
    const rng = makeRng(42);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (rng() - 0.5) * spread * 2;
      pos[i*3+1] = (rng() - 0.5) * spread;
      pos[i*3+2] = (rng() - 0.5) * spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.08, transparent: true, opacity: 0.7 }));
    ctx.scene.add(this.points);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!this.points) return;
    this.points.rotation.y = ctx.time * (this.params.speed ?? 0.05);
    this.points.rotation.x = ctx.time * (this.params.speed ?? 0.05) * 0.3;
  }

  dispose() {
    if (this.points && this.scene) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    this.points = null;
  }
}
