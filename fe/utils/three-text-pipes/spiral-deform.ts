import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface SpiralDeformPipeParams {
  strength?: number; // twist radians per unit height
  spread?: number;   // outward flare per unit height
}

export class SpiralDeformPipe extends DeformPipeBase {
  readonly name = 'spiralDeform';
  constructor(public params: SpiralDeformPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.4, spread = 0.05 } = this.params;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const angle = orig.y * strength;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const scale = 1 + Math.abs(orig.y) * spread;
        result.set(
          (orig.x * cos - orig.z * sin) * scale,
          orig.y,
          (orig.x * sin + orig.z * cos) * scale,
        );
      });
    }
  }
}
