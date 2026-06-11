import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface StudioLightPipeParams { keyIntensity?: number; fillIntensity?: number; backIntensity?: number; }

export class StudioLightPipe implements EffectPipe {
  readonly name = 'studioLight';
  private lights: THREE.Light[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: StudioLightPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { keyIntensity = 3, fillIntensity = 1.2, backIntensity = 1.5 } = this.params;
    const key = new THREE.DirectionalLight(0xfff5e8, keyIntensity);
    key.position.set(-6, 8, 8);
    const fill = new THREE.DirectionalLight(0xd0e8ff, fillIntensity);
    fill.position.set(8, 4, 4);
    const back = new THREE.DirectionalLight(0xffeedd, backIntensity);
    back.position.set(0, -4, -8);
    ctx.scene.add(key, fill, back);
    this.lights = [key, fill, back];
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}
  update(_ctx: PipeFrameContext) {}

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
