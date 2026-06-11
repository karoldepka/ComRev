import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface EmissivePulsePipeParams { color?: number; minIntensity?: number; maxIntensity?: number; speed?: number; }

export class EmissivePulsePipe implements EffectPipe {
  readonly name = 'emissivePulse';
  private mesh: THREE.Mesh | THREE.Group | null = null;

  constructor(public params: EmissivePulsePipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (!mesh) return;
    const color = new THREE.Color(this.params.color ?? 0xff6600);
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.emissive = color; mat.emissiveIntensity = 0; mat.needsUpdate = true; }
      }
    });
  }

  update(ctx: PipeFrameContext) {
    if (!this.mesh) return;
    const { minIntensity = 0, maxIntensity = 1.5, speed = 1.5 } = this.params;
    const t = (Math.sin(ctx.time * speed * Math.PI * 2) * 0.5 + 0.5);
    const intensity = minIntensity + t * (maxIntensity - minIntensity);
    const color = new THREE.Color(this.params.color ?? 0xff6600);
    this.mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.emissive.copy(color); mat.emissiveIntensity = intensity; }
      }
    });
  }

  dispose() { this.mesh = null; }
}
