import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface ChromeEdgePipeParams { color?: number; power?: number; intensity?: number; }

export class ChromeEdgePipe implements EffectPipe {
  readonly name = 'chromeEdge';
  private materials: THREE.MeshStandardMaterial[] = [];

  constructor(public params: ChromeEdgePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.materials = [];
    if (!mesh) return;
    mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            this.materials.push(m);
          }
        });
      }
    });
    this._apply();
  }

  private _apply() {
    const { color = 0xffffff, intensity = 0.6 } = this.params;
    const c = new THREE.Color(color);
    this.materials.forEach((m) => {
      m.emissive.set(c);
      m.emissiveIntensity = intensity;
    });
  }

  update(_ctx: PipeFrameContext) { this._apply(); }

  dispose() {
    this.materials.forEach((m) => {
      m.emissive.set(0x000000);
      m.emissiveIntensity = 0;
    });
    this.materials = [];
  }
}
