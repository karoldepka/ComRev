import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FlipCoinPipeParams { axis?: 'x' | 'y' | 'z'; speed?: number; }

export class FlipCoinPipe implements EffectPipe {
  readonly name = 'flipCoin';
  constructor(public params: FlipCoinPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { axis = 'y', speed = 2 } = this.params;
    const angle = ctx.time * speed * Math.PI * 2;
    if (axis === 'x') ctx.mesh.rotation.x = angle;
    else if (axis === 'y') ctx.mesh.rotation.y = angle;
    else ctx.mesh.rotation.z = angle;
  }

  dispose() {}
}
