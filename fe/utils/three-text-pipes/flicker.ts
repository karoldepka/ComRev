import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FlickerPipeParams { color?: number; baseIntensity?: number; flickerAmount?: number; }

export class FlickerPipe implements EffectPipe {
  readonly name = 'flicker';
  private light: THREE.PointLight | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: FlickerPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.light = new THREE.PointLight(this.params.color ?? 0xffa020, 2, 40);
    this.light.position.set(0, 5, 10);
    ctx.scene.add(this.light);
  }

  update(ctx: PipeFrameContext) {
    if (!this.light) return;
    const base = this.params.baseIntensity ?? 2;
    const flicker = this.params.flickerAmount ?? 1.5;
    const noise = Math.sin(ctx.time * 17.3) * Math.sin(ctx.time * 11.7) * Math.sin(ctx.time * 5.1);
    this.light.intensity = Math.max(0, base + noise * flicker);
    this.light.color.setHex(this.params.color ?? 0xffa020);
  }

  dispose() {
    if (this.light && this.scene) this.scene.remove(this.light);
    this.light = null;
  }
}
