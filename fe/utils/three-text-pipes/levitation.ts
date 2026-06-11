import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface LevitationPipeParams { amplitude?: number; speed?: number; }

export class LevitationPipe implements EffectPipe {
  readonly name = 'levitation';
  private baseY = 0;
  constructor(public params: LevitationPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(mesh: any, _ctx: PipeSetupContext) { if (mesh) this.baseY = mesh.position.y; }

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { amplitude = 0.5, speed = 0.8 } = this.params;
    ctx.mesh.position.y = this.baseY + Math.sin(ctx.time * speed * Math.PI * 2) * amplitude;
  }

  dispose() {}
}
