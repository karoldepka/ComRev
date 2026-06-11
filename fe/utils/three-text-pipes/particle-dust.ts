import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface ParticleDustPipeParams {
  count?: number;
  speed?: number;
  size?: number;
  color?: number;
  seed?: number;
  spread?: number;
}

export class ParticleDustPipe implements EffectPipe {
  readonly name = 'particleDust';
  private points: THREE.Points | null = null;
  private velocities = new Float32Array(0);
  private scene: THREE.Scene | null = null;
  private lastCount = 0;
  private lastSeed = -1;
  private lims = new Float32Array(3);

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
    this.lims[0] = spread * 2; this.lims[1] = spread * 1.2; this.lims[2] = spread;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.55 });
    this.points = new THREE.Points(geo, mat);
    this.scene?.add(this.points);
    this.lastCount = count; this.lastSeed = seed;
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    const { count = 500, seed = 42, speed = 0.5 } = this.params;
    if (count !== this.lastCount || seed !== this.lastSeed) { this.rebuild(); return; }
    if (!this.points) return;
    const pos = this.points.geometry.attributes.position.array as Float32Array;
    const lims = this.lims;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3]   += this.velocities[i3]   * speed;
      pos[i3+1] += this.velocities[i3+1] * speed;
      pos[i3+2] += this.velocities[i3+2] * speed;
      for (let k = 0; k < 3; k++) {
        if (pos[i3+k] > lims[k]) pos[i3+k] = -lims[k];
        else if (pos[i3+k] < -lims[k]) pos[i3+k] = lims[k];
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.points && this.scene) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    this.points = null;
  }
}
