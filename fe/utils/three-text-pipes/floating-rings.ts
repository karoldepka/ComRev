import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FloatingRingsPipeParams { count?: number; color?: number; speed?: number; radius?: number; }

export class FloatingRingsPipe implements EffectPipe {
  readonly name = 'floatingRings';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private rings: { mesh: THREE.Mesh; offset: number }[] = [];

  constructor(public params: FloatingRingsPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    const { count = 3, color = 0xff6600, radius = 3 } = this.params;
    this.rings = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.TorusGeometry(radius + i * 0.8, 0.06, 8, 64);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2 * (i % 2 ? 1 : 0.6);
      this.group.add(mesh);
      this.rings.push({ mesh, offset: (i / count) * Math.PI * 2 });
    }
    ctx.scene.add(this.group);
  }

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 0.5;
    this.rings.forEach(({ mesh, offset }) => {
      mesh.rotation.x += ctx.delta * speed;
      mesh.rotation.y = Math.sin(ctx.time * speed * 0.7 + offset) * 0.5;
    });
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null; this.rings = [];
  }
}
