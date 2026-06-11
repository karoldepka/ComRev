import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface GrowPipeParams { targetScale?: number; speed?: number; }

export class GrowPipe implements EffectPipe {
  readonly name = 'grow';
  private currentScale = 0.01;
  constructor(public params: GrowPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) { this.currentScale = 0.01; }

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const target = this.params.targetScale ?? 1;
    const speed = this.params.speed ?? 1;
    this.currentScale = Math.min(target, this.currentScale + ctx.delta * speed * target);
    ctx.mesh.scale.setScalar(this.currentScale);
  }

  dispose() {}
}
