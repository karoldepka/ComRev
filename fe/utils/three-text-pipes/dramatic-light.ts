import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface DramaticLightPipeParams { keyColor?: number; fillColor?: number; }

export class DramaticLightPipe implements EffectPipe {
  readonly name = 'dramaticLight';
  private lights: THREE.DirectionalLight[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: DramaticLightPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const key = new THREE.DirectionalLight(this.params.keyColor ?? 0xfff4e0, 3);
    key.position.set(-8, 12, 8);
    const fill = new THREE.DirectionalLight(this.params.fillColor ?? 0x203060, 0.8);
    fill.position.set(10, -5, 5);
    ctx.scene.add(key, fill);
    this.lights = [key, fill];
  }

  update(_ctx: PipeFrameContext) {
    if (this.lights[0]) this.lights[0].color.setHex(this.params.keyColor ?? 0xfff4e0);
    if (this.lights[1]) this.lights[1].color.setHex(this.params.fillColor ?? 0x203060);
  }

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
