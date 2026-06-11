import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface GridFloorPipeParams { color?: number; opacity?: number; size?: number; divisions?: number; }

export class GridFloorPipe implements EffectPipe {
  readonly name = 'gridFloor';
  private helper: THREE.GridHelper | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: GridFloorPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { color = 0x444444, size = 40, divisions = 40 } = this.params;
    this.helper = new THREE.GridHelper(size, divisions, color, color);
    (this.helper.material as THREE.Material).transparent = true;
    (this.helper.material as THREE.Material).opacity = this.params.opacity ?? 0.4;
    this.helper.position.y = -5;
    ctx.scene.add(this.helper);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    if (this.helper) (this.helper.material as THREE.Material).opacity = this.params.opacity ?? 0.4;
  }

  dispose() {
    if (this.helper && this.scene) this.scene.remove(this.helper);
    this.helper = null;
  }
}
