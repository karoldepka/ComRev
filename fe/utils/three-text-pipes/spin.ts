import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface SpinPipeParams { speedX?: number; speedY?: number; speedZ?: number; }

export class SpinPipe implements EffectPipe {
  readonly name = 'spin';
  constructor(public params: SpinPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { speedX = 0, speedY = 1, speedZ = 0 } = this.params;
    ctx.mesh.rotation.x += ctx.delta * speedX;
    ctx.mesh.rotation.y += ctx.delta * speedY;
    ctx.mesh.rotation.z += ctx.delta * speedZ;
  }

  dispose() {}
}
