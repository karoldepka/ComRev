import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export type BendPipeAxis = 'x' | 'y' | 'z';

export interface BendPipeParams {
  strength?: number;
  axis?: BendPipeAxis;
}

export class BendPipe extends DeformPipeBase {
  readonly name = 'bend';
  constructor(public params: BendPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.18, axis = 'x' } = this.params;
    // R→∞ as strength→0 so formula degrades to identity — no early-return needed
    const R = Math.max(0.5, 1 / Math.max(0.001, Math.abs(strength)));
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        if (axis === 'x') {
          const theta = orig.x / R;
          result.set(Math.sin(theta) * R, orig.y, orig.z + R - Math.cos(theta) * R);
        } else if (axis === 'y') {
          const theta = orig.y / R;
          result.set(orig.x, Math.sin(theta) * R, orig.z + R - Math.cos(theta) * R);
        } else {
          const theta = orig.z / R;
          result.set(orig.x + R - Math.cos(theta) * R, orig.y, Math.sin(theta) * R);
        }
      });
    }
  }
}
