import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FogEffectPipeParams { color?: number; near?: number; far?: number; }

export class FogEffectPipe implements EffectPipe {
  readonly name = 'fogEffect';
  private scene: THREE.Scene | null = null;
  private prevFog: THREE.FogBase | null = null;

  constructor(public params: FogEffectPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.prevFog = ctx.scene.fog;
    const { color = 0x000000, near = 10, far = 60 } = this.params;
    ctx.scene.fog = new THREE.Fog(color, near, far);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    if (!this.scene?.fog) return;
    const fog = this.scene.fog as THREE.Fog;
    const { color = 0x000000, near = 10, far = 60 } = this.params;
    fog.color.setHex(color);
    fog.near = near;
    fog.far = far;
  }

  dispose() {
    if (this.scene) this.scene.fog = this.prevFog;
  }
}
