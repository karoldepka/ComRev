import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface BackgroundPlanePipeParams {
  color?: number; colorBottom?: number; opacity?: number;
  width?: number; height?: number; offsetZ?: number;
  gradient?: boolean;
}

export class BackgroundPlanePipe implements EffectPipe {
  readonly name = 'backgroundPlane';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: BackgroundPlanePipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this._build(ctx);
  }

  private _build(ctx: PipeSetupContext) {
    if (this.mesh) { ctx.scene.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as any).dispose(); }
    const { color = 0x111111, colorBottom, opacity = 1, width = 40, height = 25, offsetZ = -8, gradient = false } = this.params;
    const geo = new THREE.PlaneGeometry(width, height);
    let mat: THREE.Material;
    if (gradient && colorBottom !== undefined) {
      const c1 = new THREE.Color(color), c2 = new THREE.Color(colorBottom);
      const colors: number[] = [];
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) / (height / 2) + 1) / 2;
        const c = new THREE.Color().lerpColors(c2, c1, t);
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity, depthWrite: false });
    } else {
      mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false });
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.z = offsetZ;
    this.mesh.renderOrder = -10;
    ctx.scene.add(this.mesh);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, ctx: PipeSetupContext) {}

  update(_ctx: PipeFrameContext) {
    if (!this.mesh) return;
    const { opacity = 1, offsetZ = -8 } = this.params;
    (this.mesh.material as any).opacity = opacity;
    this.mesh.position.z = offsetZ;
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
