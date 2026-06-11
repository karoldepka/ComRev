import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface ColorCycleLightPipeParams { speed?: number; intensity?: number; saturation?: number; }

export class ColorCycleLightPipe implements EffectPipe {
  readonly name = 'colorCycleLight';
  private lights: THREE.PointLight[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: ColorCycleLightPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const positions = [[-8,5,10],[8,5,10],[0,-6,10]];
    this.lights = positions.map(([x,y,z]) => {
      const l = new THREE.PointLight(0xffffff, this.params.intensity ?? 2, 40);
      l.position.set(x,y,z); ctx.scene.add(l); return l;
    });
  }

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 0.5;
    const s = this.params.saturation ?? 1;
    this.lights.forEach((l, i) => {
      const hue = (ctx.time * speed + i / this.lights.length) % 1;
      l.color.setHSL(hue, s, 0.5);
    });
  }

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
