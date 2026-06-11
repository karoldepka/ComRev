import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface PulsePipeParams { speed?: number; minScale?: number; maxScale?: number; }

export class PulsePipe implements EffectPipe {
  readonly name = 'pulse';
  private baseScale = new THREE.Vector3(1, 1, 1);

  constructor(public params: PulsePipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}
  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    if (!ctx.mesh) return;
    const { speed = 1.5, minScale = 0.9, maxScale = 1.1 } = this.params;
    const t = Math.sin(ctx.time * speed * Math.PI * 2) * 0.5 + 0.5;
    const s = minScale + t * (maxScale - minScale);
    ctx.mesh.scale.setScalar(s);
    this.baseScale.setScalar(s);
  }

  dispose() {}
}
