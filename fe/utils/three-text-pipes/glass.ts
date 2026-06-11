import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, MaterialMap, saveMeshMaterials, restoreMeshMaterials } from './base';

export interface GlassPipeParams { color?: number; roughness?: number; transmission?: number; }

export class GlassPipe implements EffectPipe {
  readonly name = 'glass';
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private savedMaterials: MaterialMap = new Map();

  constructor(public params: GlassPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    restoreMeshMaterials(this.savedMaterials);
    this.mesh = mesh;
    if (!mesh) return;
    this.savedMaterials = saveMeshMaterials(mesh);
    const { color = 0xaaddff, roughness = 0.05, transmission = 0.9 } = this.params;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshPhysicalMaterial({
          color, roughness, transmission, transparent: true,
          ior: 1.5, thickness: 0.5, metalness: 0,
        });
      }
    });
  }

  update(_ctx: PipeFrameContext) {}

  dispose() {
    restoreMeshMaterials(this.savedMaterials);
    this.mesh = null;
  }
}
