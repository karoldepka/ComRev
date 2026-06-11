import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface StrobePipeParams { color?: number; frequency?: number; intensity?: number; }

export class StrobePipe implements EffectPipe {
  readonly name = 'strobe';
  private light: THREE.PointLight | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: StrobePipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.light = new THREE.PointLight(this.params.color ?? 0xffffff, 0, 50);
    this.light.position.set(0, 5, 10);
    ctx.scene.add(this.light);
  }

  update(ctx: PipeFrameContext) {
    if (!this.light) return;
    const freq = this.params.frequency ?? 4;
    const on = Math.sin(ctx.time * freq * Math.PI * 2) > 0;
    this.light.intensity = on ? (this.params.intensity ?? 5) : 0;
    this.light.color.setHex(this.params.color ?? 0xffffff);
  }

  dispose() {
    if (this.light && this.scene) this.scene.remove(this.light);
    this.light = null;
  }
}
