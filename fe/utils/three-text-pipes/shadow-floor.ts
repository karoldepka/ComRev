import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface ShadowFloorPipeParams { color?: number; opacity?: number; size?: number; offsetY?: number; }

export class ShadowFloorPipe implements EffectPipe {
  readonly name = 'shadowFloor';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: ShadowFloorPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const { color = 0x000000, opacity = 0.35, size = 20, offsetY = -4 } = this.params;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = offsetY;
    this.mesh.renderOrder = -1;
    ctx.scene.add(this.mesh);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    if (!this.mesh) return;
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    const { color = 0x000000, opacity = 0.35, offsetY = -4 } = this.params;
    m.color.setHex(color);
    m.opacity = opacity;
    this.mesh.position.y = offsetY;
  }

  dispose() {
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    this.mesh = null;
  }
}
