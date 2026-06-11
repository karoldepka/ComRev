import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface SquishPipeParams {
  strength?: number;   // 0–1 squish amount
  axis?: 'x' | 'y' | 'z'; // axis to squish along (others expand)
}

export class SquishPipe extends DeformPipeBase {
  readonly name = 'squish';
  constructor(public params: SquishPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.5, axis = 'y' } = this.params;
    const s = 1 - strength;
    const e = 1 + strength * 0.5; // expand perpendicular axes
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        if (axis === 'y') result.set(orig.x * e, orig.y * s, orig.z * e);
        else if (axis === 'x') result.set(orig.x * s, orig.y * e, orig.z * e);
        else result.set(orig.x * e, orig.y * e, orig.z * s);
      });
    }
  }
}
