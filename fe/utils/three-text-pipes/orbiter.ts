import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface OrbiterPipeParams { count?: number; color?: number; orbitRadius?: number; speed?: number; size?: number; }

export class OrbiterPipe implements EffectPipe {
  readonly name = 'orbiter';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private orbs: { mesh: THREE.Mesh; offset: number }[] = [];

  constructor(public params: OrbiterPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    const { count = 4, color = 0xff6600, orbitRadius = 4, size = 0.3 } = this.params;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(size, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.orbs.push({ mesh, offset: (i / count) * Math.PI * 2 });
      // trail light
      const l = new THREE.PointLight(color, 0.5, 5);
      mesh.add(l);
    }
    ctx.scene.add(this.group);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 1;
    const r = this.params.orbitRadius ?? 4;
    for (const { mesh, offset } of this.orbs) {
      const angle = ctx.time * speed + offset;
      mesh.position.set(Math.cos(angle) * r, Math.sin(angle * 1.3) * 1.5, Math.sin(angle) * r);
    }
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null; this.orbs = [];
  }
}
