import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface SpotlightPipeParams { color?: number; intensity?: number; angle?: number; penumbra?: number; }

export class SpotlightPipe implements EffectPipe {
  readonly name = 'spotlight';
  private light: THREE.SpotLight | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: SpotlightPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { color = 0xffffff, intensity = 3, angle = 0.4, penumbra = 0.3 } = this.params;
    this.light = new THREE.SpotLight(color, intensity, 100, angle, penumbra);
    this.light.position.set(0, 15, 15);
    ctx.scene.add(this.light);
    ctx.scene.add(this.light.target);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.light) return;
    this.light.color.setHex(this.params.color ?? 0xffffff);
    this.light.intensity = this.params.intensity ?? 3;
    this.light.angle = this.params.angle ?? 0.4;
    this.light.penumbra = this.params.penumbra ?? 0.3;
  }

  dispose() {
    if (this.light && this.scene) { this.scene.remove(this.light); this.scene.remove(this.light.target); }
    this.light = null;
  }
}
