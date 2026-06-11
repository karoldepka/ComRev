import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface DiscoPipeParams { lightCount?: number; speed?: number; intensity?: number; }

export class DiscoPipe implements EffectPipe {
  readonly name = 'disco';
  private lights: THREE.PointLight[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: DiscoPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const count = this.params.lightCount ?? 6;
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, this.params.intensity ?? 2, 30);
      ctx.scene.add(l);
      this.lights.push(l);
    }
  }

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 2;
    const r = 12;
    this.lights.forEach((l, i) => {
      const angle = (ctx.time * speed + i / this.lights.length * Math.PI * 2);
      const wobble = ctx.time * speed * 1.3 + i;
      l.position.set(Math.cos(angle) * r, Math.sin(wobble) * 5 + 3, Math.sin(angle) * r);
      l.color.setHSL((ctx.time * 0.4 + i / this.lights.length) % 1, 1, 0.5);
    });
  }

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
