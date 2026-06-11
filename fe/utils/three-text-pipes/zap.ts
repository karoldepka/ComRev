import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface ZapPipeParams {
  strength?: number;
  speed?: number;
  density?: number; // 0–1, fraction of verts that spike
}

export class ZapPipe extends DeformPipeBase {
  readonly name = 'zap';
  constructor(public params: ZapPipeParams = {}) { super(); }

  update(ctx: PipeFrameContext) {
    const { strength = 0.5, speed = 8.0, density = 0.15 } = this.params;
    const frame = Math.floor(ctx.time * speed);
    let i = 0;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const h = Math.abs(Math.sin(i * 73.1 + frame * 97.3 + 11.7));
        if (h < density) {
          const dx = Math.sin(i * 127.1 + frame) * strength;
          const dy = Math.sin(i * 269.5 + frame * 1.3) * strength;
          const dz = Math.sin(i * 419.2 + frame * 0.7) * strength;
          result.set(orig.x + dx, orig.y + dy, orig.z + dz);
        } else {
          result.copy(orig);
        }
        i++;
      });
    }
  }
}
