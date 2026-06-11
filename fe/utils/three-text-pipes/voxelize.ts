import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface VoxelizePipeParams { gridSize?: number; }

export class VoxelizePipe extends DeformPipeBase {
  readonly name = 'voxelize';
  constructor(public params: VoxelizePipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const g = this.params.gridSize ?? 0.5;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        result.set(Math.round(orig.x / g) * g, Math.round(orig.y / g) * g, Math.round(orig.z / g) * g);
      });
    }
  }
}
