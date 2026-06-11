import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface JitterPipeParams { intensity?: number; frequency?: number; }

export class JitterPipe implements EffectPipe {
  readonly name = 'jitter';
  private basePos = { x: 0, y: 0, z: 0 };
  private nextTime = 0;
  private offX = 0; private offY = 0;
  constructor(public params: JitterPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(mesh: any, _ctx: PipeSetupContext) { if (mesh) { this.basePos.x = mesh.position.x; this.basePos.y = mesh.position.y; this.basePos.z = mesh.position.z; } }

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { intensity = 0.1, frequency = 12 } = this.params;
    if (ctx.time > this.nextTime) {
      this.offX = (Math.random() - 0.5) * 2 * intensity;
      this.offY = (Math.random() - 0.5) * 2 * intensity;
      this.nextTime = ctx.time + 1 / frequency;
    }
    ctx.mesh.position.x = this.basePos.x + this.offX;
    ctx.mesh.position.y = this.basePos.y + this.offY;
  }

  dispose() {}
}
