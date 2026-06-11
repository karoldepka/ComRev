import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface XRayPipeParams { color?: number; opacity?: number; }

export class XRayPipe implements EffectPipe {
  readonly name = 'xRay';
  private mesh: THREE.Mesh | THREE.Group | null = null;

  constructor(public params: XRayPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    this.applyMaterial(mesh);
  }

  private applyMaterial(mesh: THREE.Mesh | THREE.Group | null) {
    if (!mesh) return;
    const { color = 0x00ffff, opacity = 0.4 } = this.params;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshBasicMaterial({
          color, transparent: true, opacity, depthWrite: false, side: THREE.FrontSide,
          blending: THREE.AdditiveBlending,
        });
      }
    });
  }

  update(_ctx: PipeFrameContext) {}
  dispose() { this.mesh = null; }
}
