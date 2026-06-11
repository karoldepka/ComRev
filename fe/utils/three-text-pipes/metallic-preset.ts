import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export type MetallicPreset = 'gold' | 'chrome' | 'copper' | 'holographic' | 'obsidian';

export interface MetallicPresetPipeParams { preset?: MetallicPreset; }

const PRESETS: Record<MetallicPreset, { color: number; metalness: number; roughness: number }> = {
  gold:        { color: 0xffd700, metalness: 0.95, roughness: 0.15 },
  chrome:      { color: 0xe8e8f0, metalness: 1.0,  roughness: 0.04 },
  copper:      { color: 0xb87333, metalness: 0.9,  roughness: 0.28 },
  holographic: { color: 0xffffff, metalness: 0.8,  roughness: 0.1  },
  obsidian:    { color: 0x1a1020, metalness: 0.7,  roughness: 0.05 },
};

export class MetallicPresetPipe implements EffectPipe {
  readonly name = 'metallicPreset';
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private lastPreset: MetallicPreset | null = null;

  constructor(public params: MetallicPresetPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  private apply(mesh: THREE.Mesh | THREE.Group, preset: MetallicPreset) {
    const p = PRESETS[preset];
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.color.setHex(p.color); mat.metalness = p.metalness; mat.roughness = p.roughness; mat.needsUpdate = true; }
      }
    });
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (mesh) this.apply(mesh, this.params.preset ?? 'gold');
    this.lastPreset = null;
  }

  update(ctx: PipeFrameContext) {
    const preset = this.params.preset ?? 'gold';
    if (this.mesh && preset !== this.lastPreset) { this.apply(this.mesh, preset); this.lastPreset = preset; }
    if (preset === 'holographic' && this.mesh) {
      const hue = (ctx.time * 0.12) % 1;
      this.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial) mat.color.setHSL(hue, 0.8, 0.65);
        }
      });
    }
  }

  dispose() { this.mesh = null; }
}
