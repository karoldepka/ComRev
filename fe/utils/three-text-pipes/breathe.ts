import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface BreathePipeParams { depth?: number; speed?: number; }

export class BreathePipe implements EffectPipe {
  readonly name = 'breathe';
  constructor(public params: BreathePipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { depth = 0.08, speed = 0.4 } = this.params;
    const s = 1 + Math.sin(ctx.time * speed * Math.PI * 2) * depth;
    ctx.mesh.scale.setScalar(s);
  }

  dispose() {}
}
