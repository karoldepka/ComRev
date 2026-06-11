import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface ShrinkPipeParams { targetScale?: number; speed?: number; }

export class ShrinkPipe implements EffectPipe {
  readonly name = 'shrink';
  constructor(public params: ShrinkPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { targetScale = 0.5, speed = 1 } = this.params;
    const t = Math.min(1, ctx.time * speed * 0.5);
    ctx.mesh.scale.setScalar(1 - t * (1 - targetScale));
  }

  dispose() {}
}
