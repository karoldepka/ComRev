import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface SunsetLightPipeParams { sunColor?: number; rimColor?: number; fillColor?: number; intensity?: number; }

export class SunsetLightPipe implements EffectPipe {
  readonly name = 'sunsetLight';
  private lights: THREE.Light[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: SunsetLightPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { sunColor = 0xff8c40, rimColor = 0xff4488, fillColor = 0x3344cc, intensity = 1 } = this.params;
    const sun = new THREE.DirectionalLight(sunColor, 2.5 * intensity);
    sun.position.set(8, 4, 6);
    const rim = new THREE.DirectionalLight(rimColor, 1.5 * intensity);
    rim.position.set(-10, 2, -4);
    const fill = new THREE.DirectionalLight(fillColor, 0.6 * intensity);
    fill.position.set(0, -8, 5);
    ctx.scene.add(sun, rim, fill);
    this.lights = [sun, rim, fill];
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}
  update(_ctx: PipeFrameContext) {}

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
