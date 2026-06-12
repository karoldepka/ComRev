import * as THREE from 'three';
import { LayeredMeshPipeBase, PipeSetupContext } from './base';

export interface MatcapPipeParams { colorA?: number; colorB?: number; shininess?: number; }

export class MatcapPipe extends LayeredMeshPipeBase {
  readonly name = 'matcap';
  private texture: THREE.Texture | null = null;

  constructor(public params: MatcapPipeParams = {}) { super(); }

  setup(ctx: PipeSetupContext) {
    super.setup(ctx);
    this.texture = this.buildMatcap();
  }

  private buildMatcap(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx2d = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    const colorA = '#' + new THREE.Color(this.params.colorA ?? 0xff6600).getHexString();
    const colorB = '#' + new THREE.Color(this.params.colorB ?? 0xffffff).getHexString();
    const g = ctx2d.createRadialGradient(cx * 0.6, cy * 0.4, 0, cx, cy, size * 0.55);
    g.addColorStop(0, colorB);
    g.addColorStop(0.4, colorA);
    g.addColorStop(1, '#111');
    ctx2d.fillStyle = g; ctx2d.fillRect(0, 0, size, size);
    const shininess = this.params.shininess ?? 0.5;
    const hg = ctx2d.createRadialGradient(cx * 0.55, cy * 0.35, 0, cx * 0.55, cy * 0.35, size * 0.2 * shininess);
    hg.addColorStop(0, 'rgba(255,255,255,0.9)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx2d.fillStyle = hg; ctx2d.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  protected applyToClone(clone: THREE.Mesh | THREE.Group, _original: THREE.Mesh | THREE.Group, _ctx: PipeSetupContext) {
    if (!this.texture) return;
    const tex = this.texture;
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshMatcapMaterial({ matcap: tex });
      }
    });
  }

  dispose() {
    super.dispose();
    this.texture?.dispose();
    this.texture = null;
  }
}
