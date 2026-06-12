import * as THREE from 'three';
import { LayeredMeshPipeBase, PipeSetupContext } from './base';

export interface GlassPipeParams { color?: number; roughness?: number; transmission?: number; }

export class GlassPipe extends LayeredMeshPipeBase {
  readonly name = 'glass';

  constructor(public params: GlassPipeParams = {}) { super(); }

  protected applyToClone(clone: THREE.Mesh | THREE.Group, _original: THREE.Mesh | THREE.Group, _ctx: PipeSetupContext) {
    const { color = 0xaaddff, roughness = 0.05, transmission = 0.9 } = this.params;
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshPhysicalMaterial({
          color, roughness, transmission, transparent: true,
          ior: 1.5, thickness: 0.5, metalness: 0,
        });
      }
    });
  }
}
