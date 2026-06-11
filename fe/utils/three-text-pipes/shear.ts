import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface ShearPipeParams {
  strength?: number; // shear factor (default 0.3)
  axis?: 'xy' | 'xz' | 'yx' | 'yz' | 'zx' | 'zy'; // "offset A by factor * B"
}

export class ShearPipe extends DeformPipeBase {
  readonly name = 'shear';
  constructor(public params: ShearPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.3, axis = 'xy' } = this.params;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        result.copy(orig);
        switch (axis) {
          case 'xy': result.x += strength * orig.y; break;
          case 'xz': result.x += strength * orig.z; break;
          case 'yx': result.y += strength * orig.x; break;
          case 'yz': result.y += strength * orig.z; break;
          case 'zx': result.z += strength * orig.x; break;
          case 'zy': result.z += strength * orig.y; break;
        }
      });
    }
  }
}
