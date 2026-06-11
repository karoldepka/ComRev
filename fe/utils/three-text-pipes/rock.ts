import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface RockPipeParams { angle?: number; speed?: number; }

export class RockPipe implements EffectPipe {
  readonly name = 'rock';
  constructor(public params: RockPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { angle = 0.2, speed = 1 } = this.params;
    ctx.mesh.rotation.z = Math.sin(ctx.time * speed * Math.PI * 2) * angle;
    ctx.mesh.rotation.x = Math.sin(ctx.time * speed * Math.PI * 2 * 0.6) * angle * 0.3;
  }

  dispose() {}
}
