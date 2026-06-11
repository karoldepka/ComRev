import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface BouncePipeParams { height?: number; speed?: number; }

export class BouncePipe implements EffectPipe {
  readonly name = 'bounce';
  private baseY = 0;
  constructor(public params: BouncePipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(mesh: any, _ctx: PipeSetupContext) { if (mesh) this.baseY = mesh.position.y; }

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { height = 1.5, speed = 2 } = this.params;
    const t = Math.abs(Math.sin(ctx.time * speed));
    ctx.mesh.position.y = this.baseY + t * height;
  }

  dispose() {}
}
