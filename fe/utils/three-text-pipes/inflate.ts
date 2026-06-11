import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface InflatePipeParams { strength?: number; }

export class InflatePipe extends DeformPipeBase {
  readonly name = 'inflate';
  constructor(public params: InflatePipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const strength = this.params.strength ?? 0.5;
    for (const state of this.states) {
      const { cx, cy, cz } = computeAabb(state.originalPosition);
      applyVertexDeformation(state, (orig, result) => {
        const dx = orig.x - cx, dy = orig.y - cy, dz = orig.z - cz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        result.set(orig.x + dx / len * strength, orig.y + dy / len * strength, orig.z + dz / len * strength);
      });
    }
  }
}
