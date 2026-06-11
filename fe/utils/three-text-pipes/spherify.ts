import { DeformPipeBase, PipeFrameContext, applyVertexDeformation, computeAabb } from './base';

export interface SpherifyPipeParams {
  strength?: number; // 0 = original, 1 = full sphere
  radius?: number;   // target sphere radius (0 = auto from mesh size)
}

export class SpherifyPipe extends DeformPipeBase {
  readonly name = 'spherify';
  constructor(public params: SpherifyPipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.5 } = this.params;
    for (const state of this.states) {
      const bb = computeAabb(state.originalPosition);
      const r = this.params.radius ?? Math.max(bb.sizeX, bb.sizeY, bb.sizeZ) / 2;
      applyVertexDeformation(state, (orig, result) => {
        const dx = orig.x - bb.cx, dy = orig.y - bb.cy, dz = orig.z - bb.cz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const sx = bb.cx + dx / len * r;
        const sy = bb.cy + dy / len * r;
        const sz = bb.cz + dz / len * r;
        result.set(orig.x + (sx - orig.x) * strength, orig.y + (sy - orig.y) * strength, orig.z + (sz - orig.z) * strength);
      });
    }
  }
}
