import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface TremplePipeParams { intensity?: number; speed?: number; }

export class TremplePipe implements EffectPipe {
  readonly name = 'tremble';
  private basePos = { x: 0, y: 0, z: 0 };
  constructor(public params: TremplePipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(mesh: any, _ctx: PipeSetupContext) { if (mesh) { this.basePos.x = mesh.position.x; this.basePos.y = mesh.position.y; this.basePos.z = mesh.position.z; } }

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { intensity = 0.05, speed = 20 } = this.params;
    const jitter = (f: number) => Math.sin(ctx.time * speed * f) * intensity;
    ctx.mesh.position.x = this.basePos.x + jitter(1.0);
    ctx.mesh.position.y = this.basePos.y + jitter(1.3);
    ctx.mesh.position.z = this.basePos.z + jitter(0.7);
  }

  dispose() {}
}
