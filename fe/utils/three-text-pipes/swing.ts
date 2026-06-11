import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface SwingPipeParams { angle?: number; speed?: number; axis?: 'x' | 'y' | 'z'; }

export class SwingPipe implements EffectPipe {
  readonly name = 'swing';
  constructor(public params: SwingPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { angle = 0.4, speed = 1, axis = 'z' } = this.params;
    const v = Math.sin(ctx.time * speed * Math.PI * 2) * angle;
    if (axis === 'x') ctx.mesh.rotation.x = v;
    else if (axis === 'y') ctx.mesh.rotation.y = v;
    else ctx.mesh.rotation.z = v;
  }

  dispose() {}
}
