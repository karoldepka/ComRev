import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface FoldPipeParams {
  strength?: number; // 0 = no fold, 1 = fully folded
  axis?: 'x' | 'y' | 'z';
}

export class FoldPipe extends DeformPipeBase {
  readonly name = 'fold';
  constructor(public params: FoldPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.8, axis = 'y' } = this.params;
    for (const state of this.states) {
      const bb = computeAabb(state.originalPosition);
      const mid = axis === 'x' ? bb.cx : axis === 'y' ? bb.cy : bb.cz;
      applyVertexDeformation(state, (orig, result) => {
        result.copy(orig);
        const v = axis === 'x' ? orig.x : axis === 'y' ? orig.y : orig.z;
        if (v < mid) {
          const reflected = mid + (mid - v);
          const blended = v + (reflected - v) * strength;
          if (axis === 'x') result.x = blended;
          else if (axis === 'y') result.y = blended;
          else result.z = blended;
        }
      });
    }
  }
}
