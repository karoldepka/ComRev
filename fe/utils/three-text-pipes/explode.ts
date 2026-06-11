import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface ExplodePipeParams {
  strength?: number;
  speed?: number;   // 0 = static, >0 = pulsing
}

export class ExplodePipe extends DeformPipeBase {
  readonly name = 'explode';
  constructor(public params: ExplodePipeParams = {}) { super(); }

  update(ctx: PipeFrameContext) {
    const { strength = 1.0, speed = 0 } = this.params;
    const s = speed > 0 ? strength * (0.5 + Math.sin(ctx.time * speed * Math.PI * 2) * 0.5) : strength;
    for (const state of this.states) {
      const { cx, cy, cz } = computeAabb(state.originalPosition);
      applyVertexDeformation(state, (orig, result) => {
        const dx = orig.x - cx, dy = orig.y - cy, dz = orig.z - cz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        result.set(orig.x + dx / len * s, orig.y + dy / len * s, orig.z + dz / len * s);
      });
    }
  }
}
