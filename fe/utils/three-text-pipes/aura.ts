import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface AuraPipeParams { color?: number; opacity?: number; layers?: number; speed?: number; }

export class AuraPipe implements EffectPipe {
  readonly name = 'aura';
  private meshes: THREE.Mesh[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: AuraPipeParams = {}) {}
  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (this.scene) for (const m of this.meshes) this.scene.remove(m);
    this.meshes = [];
    if (!mesh || !this.scene) return;
    const { color = 0xff6600, opacity = 0.15, layers = 3 } = this.params;
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    for (let i = 1; i <= layers; i++) {
      const scale = 1 + i * 0.15;
      const geo = new THREE.BoxGeometry(size.x * scale, size.y * scale, size.z * scale);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: opacity / i, depthWrite: false, side: THREE.BackSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(center);
      this.scene.add(m);
      this.meshes.push(m);
    }
  }

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 1;
    this.meshes.forEach((m, i) => {
      const pulse = 1 + Math.sin(ctx.time * speed * 2 + i) * 0.05;
      m.scale.setScalar(pulse);
    });
  }

  dispose() {
    if (this.scene) for (const m of this.meshes) this.scene.remove(m);
    this.meshes = [];
  }
}
