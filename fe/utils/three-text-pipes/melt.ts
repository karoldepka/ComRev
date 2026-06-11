import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface MeltPipeParams { strength?: number; droop?: number; }

export class MeltPipe extends DeformPipeBase {
  readonly name = 'melt';
  constructor(public params: MeltPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.6, droop = 0.4 } = this.params;
    for (const state of this.states) {
      const { minY, maxY } = computeAabb(state.originalPosition);
      const range = maxY - minY || 1;
      applyVertexDeformation(state, (orig, result) => {
        const t = (orig.y - minY) / range; // 0 at bottom, 1 at top
        const sag = strength * (1 - t) * (1 - t); // bottom sags most
        result.set(
          orig.x + Math.sin(orig.x * 3.1) * sag * droop,
          orig.y - sag,
          orig.z,
        );
      });
    }
  }
}
