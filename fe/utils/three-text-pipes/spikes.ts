import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface SpikesPipeParams {
  strength?: number;
  density?: number; // fraction of vertices that spike (0–1)
  seed?: number;
}

export class SpikesPipe extends DeformPipeBase {
  readonly name = 'spikes';
  constructor(public params: SpikesPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 1.5, density = 0.2, seed = 42 } = this.params;
    const s = seed;
    for (const state of this.states) {
      const { cx, cy, cz } = computeAabb(state.originalPosition);
      let i = 0;
      applyVertexDeformation(state, (orig, result) => {
        const h = Math.abs(Math.sin(i * 127.1 + s));
        i++;
        if (h < density) {
          const dx = orig.x - cx, dy = orig.y - cy, dz = orig.z - cz;
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          result.set(orig.x + dx / len * strength, orig.y + dy / len * strength, orig.z + dz / len * strength);
        } else {
          result.copy(orig);
        }
      });
    }
  }
}
