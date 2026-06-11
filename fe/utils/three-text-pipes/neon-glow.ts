import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface NeonGlowPipeParams {
  color?: number;
  colorIdx?: number;
  intensity?: number;
  pulseSpeed?: number;
  pulseAmplitude?: number;
}

const PALETTE = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff88, 0xff0066];

export class NeonGlowPipe implements EffectPipe {
  readonly name = 'neonGlow';
  private lights: THREE.PointLight[] = [];
  private scene: THREE.Scene | null = null;
  private mesh: THREE.Mesh | THREE.Group | null = null;

  constructor(public params: NeonGlowPipeParams = {}) {}

  private resolveColor(): number {
    if (this.params.colorIdx !== undefined) return PALETTE[this.params.colorIdx % PALETTE.length];
    return this.params.color ?? 0xff00ff;
  }

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const c = new THREE.Color(this.resolveColor());
    const l1 = new THREE.PointLight(c, 2, 40); l1.position.set(-6, 5, 10);
    const l2 = new THREE.PointLight(c, 2, 40); l2.position.set(6, -5, 10);
    ctx.scene.add(l1, l2);
    this.lights = [l1, l2];
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (!mesh) return;
    const color = this.resolveColor();
    const intensity = this.params.intensity ?? 0.8;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.emissive = new THREE.Color(color); mat.emissiveIntensity = intensity; mat.needsUpdate = true; }
      }
    });
  }

  update(ctx: PipeFrameContext) {
    const { intensity = 0.8, pulseSpeed = 1.0, pulseAmplitude = 0.3 } = this.params;
    const pulse = 1 + Math.sin(ctx.time * pulseSpeed * Math.PI * 2) * pulseAmplitude;
    const c = new THREE.Color(this.resolveColor());
    for (const l of this.lights) { l.color.copy(c); l.intensity = 2 * pulse; }
    if (this.mesh) {
      this.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial) { mat.emissive.copy(c); mat.emissiveIntensity = intensity * pulse; }
        }
      });
    }
  }

  dispose() {
    if (this.scene) for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
  }
}
