import { DeformPipeBase, PipeFrameContext, applyVertexDeformation } from './base';

export interface CrumplePipeParams { strength?: number; seed?: number; }

export class CrumplePipe extends DeformPipeBase {
  readonly name = 'crumple';
  constructor(public params: CrumplePipeParams = {}) { super(); }

  update(_ctx: PipeFrameContext) {
    const { strength = 0.3, seed = 42 } = this.params;
    const s = seed;
    let i = 0;
    for (const state of this.states) {
      applyVertexDeformation(state, (orig, result) => {
        const nx = Math.sin(i * 127.1 + s * 311.7) * strength;
        const ny = Math.sin(i * 269.5 + s * 183.3) * strength;
        const nz = Math.sin(i * 419.2 + s * 256.9) * strength;
        result.set(orig.x + nx, orig.y + ny, orig.z + nz);
        i++;
      });
    }
  }
}
