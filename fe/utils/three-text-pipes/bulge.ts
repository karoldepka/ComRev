import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface BulgePipeParams {
  strength?: number;
  radius?: number;
}

// Center of mesh bulges outward — correct convex-lens shape (opposite of FishEyePipe's concave)
export class BulgePipe extends DeformPipeBase {
  readonly name = 'bulge';
  constructor(public params: BulgePipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.8, radius = 8 } = this.params;
    const r2max = Math.max(0.1, radius) ** 2;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const r2 = orig.x * orig.x + orig.y * orig.y;
        const falloff = Math.exp(-r2 / r2max);
        result.set(orig.x, orig.y, orig.z + strength * falloff);
      });
    }
  }
}
