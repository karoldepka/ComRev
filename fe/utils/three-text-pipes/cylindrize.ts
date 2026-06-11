import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface CylindrizePipeParams {
  radius?: number; // cylinder radius (default 6)
  axis?: 'x' | 'y'; // which axis to wrap along
}

export class CylindrizePipe extends DeformPipeBase {
  readonly name = 'cylindrize';
  constructor(public params: CylindrizePipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { radius = 6, axis = 'x' } = this.params;
    const R = Math.max(0.1, radius);
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        if (axis === 'x') {
          const theta = orig.x / R;
          result.set(Math.sin(theta) * R, orig.y, orig.z + Math.cos(theta) * R - R);
        } else {
          const theta = orig.y / R;
          result.set(orig.x, Math.sin(theta) * R, orig.z + Math.cos(theta) * R - R);
        }
      });
    }
  }
}
