import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, MaterialMap, saveMeshMaterials, restoreMeshMaterials } from './base';

export interface XRayPipeParams { color?: number; opacity?: number; }

export class XRayPipe implements EffectPipe {
  readonly name = 'xRay';
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private savedMaterials: MaterialMap = new Map();

  constructor(public params: XRayPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    restoreMeshMaterials(this.savedMaterials);
    this.mesh = mesh;
    if (!mesh) return;
    this.savedMaterials = saveMeshMaterials(mesh);
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

  dispose() {
    restoreMeshMaterials(this.savedMaterials);
    this.mesh = null;
  }
}
