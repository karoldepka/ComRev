import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface MoonLightPipeParams { intensity?: number; ambientIntensity?: number; }

export class MoonLightPipe implements EffectPipe {
  readonly name = 'moonLight';
  private lights: THREE.Light[] = [];
  private scene: THREE.Scene | null = null;

  constructor(public params: MoonLightPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { intensity = 1, ambientIntensity = 0.15 } = this.params;
    const moon = new THREE.DirectionalLight(0xc8d8ff, 2 * intensity);
    moon.position.set(-5, 14, 5);
    const ambient = new THREE.AmbientLight(0x0a1030, ambientIntensity * 4);
    const rim = new THREE.DirectionalLight(0x4060ff, 0.4 * intensity);
    rim.position.set(6, -3, -6);
    ctx.scene.add(moon, ambient, rim);
    this.lights = [moon, ambient, rim];
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}
  update(_ctx: PipeFrameContext) {}

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
