import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface MatcapPipeParams { colorA?: number; colorB?: number; shininess?: number; }

export class MatcapPipe implements EffectPipe {
  readonly name = 'matcap';
  private texture: THREE.Texture | null = null;
  private mesh: THREE.Mesh | THREE.Group | null = null;

  constructor(public params: MatcapPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {
    this.texture = this.buildMatcap();
  }

  private buildMatcap(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    const colorA = '#' + new THREE.Color(this.params.colorA ?? 0xff6600).getHexString();
    const colorB = '#' + new THREE.Color(this.params.colorB ?? 0xffffff).getHexString();
    const g = ctx.createRadialGradient(cx * 0.6, cy * 0.4, 0, cx, cy, size * 0.55);
    g.addColorStop(0, colorB);
    g.addColorStop(0.4, colorA);
    g.addColorStop(1, '#111');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const shininess = this.params.shininess ?? 0.5;
    const hg = ctx.createRadialGradient(cx * 0.55, cy * 0.35, 0, cx * 0.55, cy * 0.35, size * 0.2 * shininess);
    hg.addColorStop(0, 'rgba(255,255,255,0.9)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh;
    if (!mesh || !this.texture) return;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) child.material = new THREE.MeshMatcapMaterial({ matcap: this.texture! });
    });
  }

  update(_ctx: PipeFrameContext) {}

  dispose() {
    this.texture?.dispose();
    this.texture = null;
    this.mesh = null;
  }
}
