import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface SwayPipeParams { amplitude?: number; speed?: number; }

export class SwayPipe implements EffectPipe {
  readonly name = 'sway';
  constructor(public params: SwayPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { amplitude = 0.2, speed = 0.7 } = this.params;
    ctx.mesh.rotation.z = Math.sin(ctx.time * speed * Math.PI * 2) * amplitude;
  }

  dispose() {}
}
