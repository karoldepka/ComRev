import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface WigglePipeParams { amount?: number; speed?: number; }

export class WigglePipe implements EffectPipe {
  readonly name = 'wiggle';
  constructor(public params: WigglePipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { amount = 0.15, speed = 5 } = this.params;
    ctx.mesh.rotation.x = Math.sin(ctx.time * speed * 1.0) * amount;
    ctx.mesh.rotation.z = Math.sin(ctx.time * speed * 0.8) * amount;
  }

  dispose() {}
}
