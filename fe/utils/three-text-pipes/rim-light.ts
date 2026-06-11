import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface RimLightPipeParams { color?: number; intensity?: number; }

export class RimLightPipe implements EffectPipe {
  readonly name = 'rimLight';
  private light: THREE.DirectionalLight | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: RimLightPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.light = new THREE.DirectionalLight(this.params.color ?? 0x4488ff, this.params.intensity ?? 2);
    this.light.position.set(0, 0, -15);
    ctx.scene.add(this.light);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.light) return;
    this.light.color.setHex(this.params.color ?? 0x4488ff);
    this.light.intensity = this.params.intensity ?? 2;
  }

  dispose() {
    if (this.light && this.scene) this.scene.remove(this.light);
    this.light = null;
  }
}
