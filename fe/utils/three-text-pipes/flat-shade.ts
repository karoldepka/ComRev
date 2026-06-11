import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FlatShadePipeParams { enabled?: boolean; }

export class FlatShadePipe implements EffectPipe {
  readonly name = 'flatShade';
  private affected: THREE.Material[] = [];

  constructor(public params: FlatShadePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.affected = [];
    if (!mesh) return;
    mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m: any) => {
          m.flatShading = true;
          m.needsUpdate = true;
          this.affected.push(m);
        });
      }
    });
  }

  update(_ctx: PipeFrameContext) {}

  dispose() {
    this.affected.forEach((m: any) => {
      m.flatShading = false;
      m.needsUpdate = true;
    });
    this.affected = [];
  }
}
