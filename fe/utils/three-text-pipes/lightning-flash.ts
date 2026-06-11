import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface LightningFlashPipeParams { color?: number; intensity?: number; frequency?: number; }

export class LightningFlashPipe implements EffectPipe {
  readonly name = 'lightningFlash';
  private light: THREE.PointLight | null = null;
  private scene: THREE.Scene | null = null;
  private nextFlash = 0;
  private flashEnd = 0;

  constructor(public params: LightningFlashPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.light = new THREE.PointLight(this.params.color ?? 0xaaccff, 0, 80);
    this.light.position.set(0, 10, 10);
    ctx.scene.add(this.light);
  }

  update(ctx: PipeFrameContext) {
    if (!this.light) return;
    const freq = this.params.frequency ?? 2;
    if (ctx.time > this.nextFlash) {
      this.flashEnd = ctx.time + 0.05 + Math.random() * 0.08;
      this.nextFlash = ctx.time + 1 / freq + (Math.random() - 0.5) / freq;
    }
    this.light.intensity = ctx.time < this.flashEnd ? (this.params.intensity ?? 8) : 0;
    this.light.color.setHex(this.params.color ?? 0xaaccff);
  }

  dispose() {
    if (this.light && this.scene) this.scene.remove(this.light);
    this.light = null;
  }
}
