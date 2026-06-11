import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FigureEightPipeParams { width?: number; height?: number; speed?: number; }

export class FigureEightPipe implements EffectPipe {
  readonly name = 'figureEight';
  constructor(public params: FigureEightPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { width = 2, height = 1, speed = 0.5 } = this.params;
    const t = ctx.time * speed * Math.PI * 2;
    ctx.mesh.position.x = Math.sin(t) * width;
    ctx.mesh.position.y = Math.sin(t * 2) * height * 0.5;
  }

  dispose() {}
}
