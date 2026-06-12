import * as THREE from 'three';
import { LayeredMeshPipeBase, PipeSetupContext } from './base';

export interface XRayPipeParams { color?: number; opacity?: number; }

export class XRayPipe extends LayeredMeshPipeBase {
  readonly name = 'xRay';

  constructor(public params: XRayPipeParams = {}) { super(); }

  protected applyToClone(clone: THREE.Mesh | THREE.Group, _original: THREE.Mesh | THREE.Group, _ctx: PipeSetupContext) {
    const { color = 0x00ffff, opacity = 0.4 } = this.params;
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshBasicMaterial({
          color, transparent: true, opacity, depthWrite: false, side: THREE.FrontSide,
          blending: THREE.AdditiveBlending,
        });
      }
    });
  }
}
