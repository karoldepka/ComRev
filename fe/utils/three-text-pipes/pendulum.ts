import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface PendulumPipeParams { angle?: number; speed?: number; dampening?: number; }

export class PendulumPipe implements EffectPipe {
  readonly name = 'pendulum';
  constructor(public params: PendulumPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { angle = 0.5, speed = 1.2 } = this.params;
    ctx.mesh.rotation.z = Math.sin(ctx.time * speed * Math.PI * 2) * angle;
  }

  dispose() {}
}
