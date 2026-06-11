import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface EchoCopiesPipeParams {
  count?: number;         // number of copies (default 4)
  offsetX?: number;       // x shift per copy (default 0.3)
  offsetY?: number;       // y shift per copy (default 0)
  offsetZ?: number;       // z shift per copy (default -0.5)
  rotateY?: number;       // y rotation per copy in radians (default 0)
  rotateZ?: number;       // z rotation per copy in radians (default 0)
  scaleStep?: number;     // scale multiplier per copy, e.g. 0.95 (default 1)
  opacity?: number;       // opacity of copies (default 0.4)
  color?: number;         // tint color (default 0xff6600)
  fade?: boolean;         // fade opacity with depth (default true)
}

export class EchoCopiesPipe implements EffectPipe {
  readonly name = 'echoCopies';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: EchoCopiesPipeParams = {}) {}

  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (this.group && this.scene) { this.scene.remove(this.group); this.group = null; }
    if (!mesh || !this.scene) return;

    const {
      count = 4, offsetX = 0.3, offsetY = 0, offsetZ = -0.5,
      rotateY = 0, rotateZ = 0, scaleStep = 1,
      opacity = 0.4, color = 0xff6600, fade = true,
    } = this.params;

    this.group = new THREE.Group();
    for (let i = 1; i <= count; i++) {
      const alpha = fade ? opacity * (1 - i / (count + 1)) : opacity;
      const mat = new THREE.MeshStandardMaterial({
        color, transparent: true, opacity: alpha, depthWrite: false,
      });
      const clone = mesh.clone(true);
      clone.traverse(c => { if (c instanceof THREE.Mesh) c.material = mat; });
      clone.position.set(offsetX * i, offsetY * i, offsetZ * i);
      clone.rotation.y += rotateY * i;
      clone.rotation.z += rotateZ * i;
      const s = Math.pow(scaleStep, i);
      clone.scale.setScalar(s);
      this.group.add(clone);
    }
    this.scene.add(this.group);
  }

  update(ctx: PipeFrameContext) {
    if (!this.group || !ctx.mesh) return;
    this.group.rotation.copy(ctx.mesh.rotation);
    this.group.position.copy(ctx.mesh.position);
    this.group.scale.copy(ctx.mesh.scale);
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null;
  }
}
