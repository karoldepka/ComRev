import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface OutlinePipeParams {
  color?: number;      // outline color (default 0xff6600)
  thickness?: number;  // scale factor e.g. 1.05 (default 1.05)
}

export class OutlinePipe implements EffectPipe {
  readonly name = 'outline';
  private outlineGroup: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: OutlinePipeParams = {}) {}

  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!this.scene) return;
    if (this.outlineGroup) { this.scene.remove(this.outlineGroup); this.outlineGroup = null; }
    if (!mesh) return;
    const { color = 0xff6600, thickness = 1.05 } = this.params;
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    const clone = mesh.clone(true);
    clone.scale.multiplyScalar(thickness);
    clone.traverse(c => { if (c instanceof THREE.Mesh) c.material = mat; });
    this.outlineGroup = clone as unknown as THREE.Group;
    this.scene.add(this.outlineGroup);
  }

  update(ctx: PipeFrameContext) {
    if (!this.outlineGroup || !ctx.mesh) return;
    this.outlineGroup.rotation.copy(ctx.mesh.rotation);
    this.outlineGroup.position.copy(ctx.mesh.position);
    this.outlineGroup.scale.copy(ctx.mesh.scale).multiplyScalar(this.params.thickness ?? 1.05);
  }

  dispose() {
    if (this.outlineGroup && this.scene) this.scene.remove(this.outlineGroup);
    this.outlineGroup = null;
  }
}
