import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface NoiseWobblePipeParams {
  amplitude?: number;
  frequency?: number;
  speed?: number;
}

export class NoiseWobblePipe extends DeformPipeBase {
  readonly name = 'noiseWobble';
  constructor(public params: NoiseWobblePipeParams = {}) { super(); }

  update(ctx: PipeFrameContext) {
    const { amplitude = 0.3, frequency = 2.0, speed = 1.5 } = this.params;
    const t = ctx.time * speed;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const f = frequency;
        const nx = Math.sin(orig.x * f + orig.y * f * 0.7 + t * 2.3) * amplitude;
        const ny = Math.sin(orig.y * f + orig.z * f * 0.9 + t * 1.7) * amplitude;
        const nz = Math.sin(orig.z * f + orig.x * f * 1.1 + t * 1.3) * amplitude;
        result.set(orig.x + nx, orig.y + ny, orig.z + nz);
      });
    }
  }
}
