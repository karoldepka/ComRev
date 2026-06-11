import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface TaperPipeParams {
  strength?: number; // 0 = no taper, 1 = full point
  axis?: 'x' | 'y' | 'z';
}

export class TaperPipe extends DeformPipeBase {
  readonly name = 'taper';
  constructor(public params: TaperPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.6, axis = 'y' } = this.params;
    for (const state of this.states) {
      const bb = computeAabb(state.originalPosition);
      const [min, max] = axis === 'x' ? [bb.minX, bb.maxX] : axis === 'y' ? [bb.minY, bb.maxY] : [bb.minZ, bb.maxZ];
      const range = max - min || 1;
      applyVertexDeformation(state, (orig, result) => {
        const t = ((axis === 'x' ? orig.x : axis === 'y' ? orig.y : orig.z) - min) / range;
        const scale = 1 - t * strength;
        if (axis === 'y') result.set(orig.x * scale, orig.y, orig.z * scale);
        else if (axis === 'x') result.set(orig.x, orig.y * scale, orig.z * scale);
        else result.set(orig.x * scale, orig.y * scale, orig.z);
      });
    }
  }
}
