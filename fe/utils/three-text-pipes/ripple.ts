import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface RipplePipeParams {
  amplitude?: number;
  frequency?: number;
  speed?: number;
}

export class RipplePipe extends DeformPipeBase {
  readonly name = 'ripple';
  constructor(public params: RipplePipeParams = {}) { super(); }

  update(ctx: PipeFrameContext) {
    const { amplitude = 0.4, frequency = 1.5, speed = 2.0 } = this.params;
    const phase = ctx.time * speed * Math.PI * 2;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const r = Math.sqrt(orig.x * orig.x + orig.y * orig.y);
        result.set(orig.x, orig.y, orig.z + Math.sin(r * frequency * Math.PI * 2 - phase) * amplitude);
      });
    }
  }
}
