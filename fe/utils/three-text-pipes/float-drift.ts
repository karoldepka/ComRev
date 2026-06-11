import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FloatDriftPipeParams { amplitude?: number; speed?: number; }

export class FloatDriftPipe implements EffectPipe {
  readonly name = 'floatDrift';
  private baseX = 0; private baseY = 0;
  constructor(public params: FloatDriftPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(mesh: any, _ctx: PipeSetupContext) { if (mesh) { this.baseX = mesh.position.x; this.baseY = mesh.position.y; } }

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { amplitude = 0.3, speed = 0.3 } = this.params;
    ctx.mesh.position.x = this.baseX + Math.sin(ctx.time * speed * 1.1) * amplitude;
    ctx.mesh.position.y = this.baseY + Math.sin(ctx.time * speed * 0.7) * amplitude * 0.6;
  }

  dispose() {}
}
