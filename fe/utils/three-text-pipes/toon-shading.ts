import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface ToonShadingPipeParams { color?: number; steps?: number; }

export class ToonShadingPipe implements EffectPipe {
  readonly name = 'toonShading';
  private mesh: THREE.Mesh | THREE.Group | null = null;

  constructor(public params: ToonShadingPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (!mesh) return;
    const { color = 0x44cc88, steps = 4 } = this.params;
    const colors = new Uint8Array(steps * 3);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const c = new THREE.Color(color).multiplyScalar(0.3 + t * 0.7);
      colors[i * 3] = Math.round(c.r * 255);
      colors[i * 3 + 1] = Math.round(c.g * 255);
      colors[i * 3 + 2] = Math.round(c.b * 255);
    }
    const gradientMap = new THREE.DataTexture(colors, steps, 1, THREE.RGBFormat);
    gradientMap.needsUpdate = true;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshToonMaterial({ color, gradientMap });
      }
    });
  }

  update(_ctx: PipeFrameContext) {}
  dispose() { this.mesh = null; }
}
