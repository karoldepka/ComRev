import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface WireframePipeParams { color?: number; opacity?: number; }

export class WireframePipe implements EffectPipe {
  readonly name = 'wireframe';
  private overlay: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: WireframePipeParams = {}) {}
  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!this.scene) return;
    if (this.overlay) { this.scene.remove(this.overlay); this.overlay = null; }
    if (!mesh) return;
    const { color = 0x00ff88, opacity = 0.25 } = this.params;
    const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity });
    const clone = mesh.clone(true);
    clone.traverse(c => { if (c instanceof THREE.Mesh) c.material = mat; });
    this.overlay = clone as unknown as THREE.Group;
    this.scene.add(this.overlay);
  }

  update(ctx: PipeFrameContext) {
    if (!this.overlay || !ctx.mesh) return;
    this.overlay.rotation.copy(ctx.mesh.rotation);
    this.overlay.position.copy(ctx.mesh.position);
    this.overlay.scale.copy(ctx.mesh.scale);
  }

  dispose() {
    if (this.overlay && this.scene) this.scene.remove(this.overlay);
    this.overlay = null;
  }
}
