import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface FishEyePipeParams {
  strength?: number; // 0–1.0
  radius?: number;   // influence radius in world units
}

export class FishEyePipe extends DeformPipeBase {
  readonly name = 'fishEye';
  constructor(public params: FishEyePipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.35, radius = 10 } = this.params;
    const r2max = Math.max(0.1, radius) ** 2;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const dx = orig.x, dy = orig.y, r2 = dx * dx + dy * dy;
        if (r2 <= 0) { result.copy(orig); return; }
        const factor = 1 + strength * Math.exp(-r2 / r2max);
        result.set(dx * factor, dy * factor, orig.z + strength * 0.3 * Math.exp(-r2 / r2max));
      });
    }
  }
}
