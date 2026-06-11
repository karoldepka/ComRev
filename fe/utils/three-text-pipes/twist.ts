import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface TwistPipeParams {
  strength?: number;
  axis?: 'x' | 'y' | 'z';
}

export class TwistPipe extends DeformPipeBase {
  readonly name = 'twist';
  constructor(public params: TwistPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.3, axis = 'y' } = this.params;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const t = axis === 'x' ? orig.x : axis === 'y' ? orig.y : orig.z;
        const a = t * strength, cos = Math.cos(a), sin = Math.sin(a);
        if (axis === 'x') result.set(orig.x, orig.y * cos - orig.z * sin, orig.y * sin + orig.z * cos);
        else if (axis === 'y') result.set(orig.x * cos - orig.z * sin, orig.y, orig.x * sin + orig.z * cos);
        else result.set(orig.x * cos - orig.y * sin, orig.x * sin + orig.y * cos, orig.z);
      });
    }
  }
}
