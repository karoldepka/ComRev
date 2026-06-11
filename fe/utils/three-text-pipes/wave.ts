import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface WavePipeParams {
  amplitude?: number;
  frequency?: number;
  speed?: number;
  axis?: 'x' | 'y';
}

export class WavePipe extends DeformPipeBase {
  readonly name = 'wave';
  constructor(public params: WavePipeParams = {}) { super(); }

  update(ctx: PipeFrameContext) {
    const { amplitude = 0.5, frequency = 1.0, speed = 1.0, axis = 'x' } = this.params;
    const phase = ctx.time * speed * Math.PI * 2;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const wave = Math.sin((axis === 'x' ? orig.x : orig.y) * frequency * Math.PI * 2 + phase) * amplitude;
        result.set(orig.x, orig.y, orig.z + wave);
      });
    }
  }
}
