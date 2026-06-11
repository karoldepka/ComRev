import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface RainbowLightsPipeParams { count?: number; speed?: number; intensity?: number; }

export class RainbowLightsPipe implements EffectPipe {
  readonly name = 'rainbowLights';
  private lights: THREE.PointLight[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: RainbowLightsPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const count = this.params.count ?? 7;
    for (let i = 0; i < count; i++) {
      const hue = i / count;
      const l = new THREE.PointLight(new THREE.Color().setHSL(hue, 1, 0.5), this.params.intensity ?? 1.5, 30);
      ctx.scene.add(l);
      this.lights.push(l);
    }
  }

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 0.5;
    const r = 10;
    this.lights.forEach((l, i) => {
      const angle = (i / this.lights.length) * Math.PI * 2 + ctx.time * speed;
      l.position.set(Math.cos(angle) * r, Math.sin(angle * 0.7) * 5, Math.sin(angle) * r);
    });
  }

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
