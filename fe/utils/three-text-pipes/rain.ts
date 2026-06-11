import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface RainPipeParams { count?: number; speed?: number; spread?: number; color?: number; }

export class RainPipe implements EffectPipe {
  readonly name = 'rain';
  private lines: THREE.LineSegments | null = null;
  private scene: THREE.Scene | null = null;
  private vx: Float32Array = new Float32Array(0);
  private spread = 20;

  constructor(public params: RainPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { count = 300, spread = 20, color = 0x99ccff } = this.params;
    this.spread = spread;
    const rng = makeRng(42);
    const pos = new Float32Array(count * 6);
    this.vx = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (rng() - 0.5) * spread * 2;
      const y = (rng() - 0.5) * spread * 0.8;
      const z = (rng() - 0.5) * spread;
      const len = 0.15 + rng() * 0.3;
      pos[i*6]   = x; pos[i*6+1] = y;     pos[i*6+2] = z;
      pos[i*6+3] = x; pos[i*6+4] = y-len; pos[i*6+5] = z;
      this.vx[i] = (rng() - 0.5) * 0.005;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
    ctx.scene.add(this.lines);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    if (!this.lines) return;
    const speed = this.params.speed ?? 1;
    const count = this.params.count ?? 300;
    const spread = this.spread;
    const pos = this.lines.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const fallSpeed = 0.08 * speed;
      pos[i*6+1] -= fallSpeed; pos[i*6+4] -= fallSpeed;
      pos[i*6]   += this.vx[i]; pos[i*6+3] += this.vx[i];
      if (pos[i*6+1] < -spread * 0.8) { pos[i*6+1] = spread * 0.8; pos[i*6+4] = spread * 0.8 - (pos[i*6+1] - pos[i*6+4]); }
      if (Math.abs(pos[i*6]) > spread) { pos[i*6] = -Math.sign(pos[i*6]) * spread; pos[i*6+3] = pos[i*6]; }
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.lines && this.scene) { this.scene.remove(this.lines); this.lines.geometry.dispose(); }
    this.lines = null;
  }
}
