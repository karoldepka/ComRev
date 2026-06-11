import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface MirrorPlanePipeParams { opacity?: number; color?: number; axis?: 'y' | 'x' | 'z'; offset?: number; }

export class MirrorPlanePipe implements EffectPipe {
  readonly name = 'mirrorPlane';
  private mirror: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: MirrorPlanePipeParams = {}) {}
  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (this.mirror && this.scene) { this.scene.remove(this.mirror); this.mirror = null; }
    if (!mesh || !this.scene) return;
    const { opacity = 0.3, color = 0xffffff, axis = 'y', offset = 0 } = this.params;
    const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false });
    const clone = mesh.clone(true);
    clone.traverse(c => { if (c instanceof THREE.Mesh) c.material = mat; });
    if (axis === 'y') clone.scale.y = -1;
    else if (axis === 'x') clone.scale.x = -1;
    else clone.scale.z = -1;
    this.mirror = clone as unknown as THREE.Group;
    this.scene.add(this.mirror);
  }

  update(ctx: PipeFrameContext) {
    if (!this.mirror || !ctx.mesh) return;
    const { axis = 'y', offset = 0 } = this.params;
    this.mirror.rotation.copy(ctx.mesh.rotation);
    this.mirror.position.copy(ctx.mesh.position);
    if (axis === 'y') { this.mirror.position.y = -ctx.mesh.position.y + offset; this.mirror.scale.set(1, -1, 1); }
    else if (axis === 'x') { this.mirror.position.x = -ctx.mesh.position.x + offset; this.mirror.scale.set(-1, 1, 1); }
    else { this.mirror.position.z = -ctx.mesh.position.z + offset; this.mirror.scale.set(1, 1, -1); }
  }

  dispose() {
    if (this.mirror && this.scene) this.scene.remove(this.mirror);
    this.mirror = null;
  }
}
