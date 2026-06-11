import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface OrbitAnimPipeParams { radius?: number; speed?: number; axis?: 'y' | 'x' | 'z'; }

export class OrbitAnimPipe implements EffectPipe {
  readonly name = 'orbitAnim';
  constructor(public params: OrbitAnimPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: any, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { radius = 3, speed = 0.5, axis = 'y' } = this.params;
    const angle = ctx.time * speed * Math.PI * 2;
    if (axis === 'y') { ctx.mesh.position.x = Math.cos(angle) * radius; ctx.mesh.position.z = Math.sin(angle) * radius; }
    else if (axis === 'x') { ctx.mesh.position.y = Math.cos(angle) * radius; ctx.mesh.position.z = Math.sin(angle) * radius; }
    else { ctx.mesh.position.x = Math.cos(angle) * radius; ctx.mesh.position.y = Math.sin(angle) * radius; }
  }

  dispose() {}
}
