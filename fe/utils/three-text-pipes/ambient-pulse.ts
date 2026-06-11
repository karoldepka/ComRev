import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface AmbientPulsePipeParams { color?: number; minIntensity?: number; maxIntensity?: number; speed?: number; }

export class AmbientPulsePipe implements EffectPipe {
  readonly name = 'ambientPulse';
  private light: THREE.AmbientLight | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: AmbientPulsePipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.light = new THREE.AmbientLight(this.params.color ?? 0xffffff, 0);
    ctx.scene.add(this.light);
  }

  update(ctx: PipeFrameContext) {
    if (!this.light) return;
    const { minIntensity = 0.1, maxIntensity = 2, speed = 1 } = this.params;
    const t = Math.sin(ctx.time * speed * Math.PI * 2) * 0.5 + 0.5;
    this.light.intensity = minIntensity + t * (maxIntensity - minIntensity);
    this.light.color.setHex(this.params.color ?? 0xffffff);
  }

  dispose() {
    if (this.light && this.scene) this.scene.remove(this.light);
    this.light = null;
  }
}
