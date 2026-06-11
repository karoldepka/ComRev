import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface ConfettiPipeParams { count?: number; speed?: number; spread?: number; }

export class ConfettiPipe implements EffectPipe {
  readonly name = 'confetti';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private pieces: { mesh: THREE.Mesh; vy: number; vx: number; vz: number; spin: THREE.Vector3 }[] = [];
  private spread = 15;

  constructor(public params: ConfettiPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    const { count = 60, spread = 15 } = this.params;
    this.spread = spread;
    const rng = makeRng(42);
    const colors = [0xff6600, 0x00ccff, 0xff00ff, 0xffff00, 0x00ff88, 0xff4444];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(0.15 + rng() * 0.2, 0.06 + rng() * 0.1);
      const mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(rng() * colors.length)], side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((rng() - 0.5) * spread * 2, (rng() - 0.5) * spread * 0.8, (rng() - 0.5) * spread);
      this.group.add(mesh);
      this.pieces.push({
        mesh,
        vy: -(0.03 + rng() * 0.05),
        vx: (rng() - 0.5) * 0.02,
        vz: (rng() - 0.5) * 0.01,
        spin: new THREE.Vector3((rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1),
      });
    }
    ctx.scene.add(this.group);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 1;
    const spread = this.spread;
    for (const p of this.pieces) {
      p.mesh.position.y += p.vy * speed;
      p.mesh.position.x += p.vx * speed;
      p.mesh.position.z += p.vz * speed;
      p.mesh.rotation.x += p.spin.x; p.mesh.rotation.y += p.spin.y; p.mesh.rotation.z += p.spin.z;
      if (p.mesh.position.y < -spread * 0.8) p.mesh.position.y = spread * 0.8;
    }
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null; this.pieces = [];
  }
}
