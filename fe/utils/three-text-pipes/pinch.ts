import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface PinchPipeParams {
  strength?: number; // positive = pull in, negative = push out
}

export class PinchPipe extends DeformPipeBase {
  readonly name = 'pinch';
  constructor(public params: PinchPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const strength = this.params.strength ?? 0.5;
    for (const state of this.states) {
      const { cx, cy, cz } = computeAabb(state.originalPosition);
      applyVertexDeformation(state, (orig, result) => {
        const dx = orig.x - cx, dy = orig.y - cy, dz = orig.z - cz;
        const factor = 1 - strength;
        result.set(cx + dx * factor, cy + dy * factor, cz + dz * factor);
      });
    }
  }
}
