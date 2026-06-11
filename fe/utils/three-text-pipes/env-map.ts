import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export type EnvMapStyle = 'gradient' | 'studio' | 'starfield' | 'sunset' | 'neon';

export interface EnvMapPipeParams {
  style?: EnvMapStyle;
  seed?: number;
  intensity?: number;
}

export class EnvMapPipe implements EffectPipe {
  readonly name = 'envMap';
  private texture: THREE.Texture | null = null;
  private sceneRef: THREE.Scene | null = null;
  private lastStyle = '';
  private lastSeed = -1;

  constructor(public params: EnvMapPipeParams = {}) {}

  private buildTexture(style: EnvMapStyle, seed: number): THREE.Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    const rng = makeRng(seed);

    switch (style) {
      case 'gradient': {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#00ff88');
        g.addColorStop(0.6, '#0088ff'); g.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
        ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.arc(cx, cy, i * 90, 0, Math.PI * 2); ctx.stroke(); }
        break;
      }
      case 'studio': {
        ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, size, size);
        const kl = ctx.createRadialGradient(cx * 0.4, cy * 0.25, 0, cx * 0.4, cy * 0.25, size * 0.55);
        kl.addColorStop(0, 'rgba(255,255,255,0.95)'); kl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = kl; ctx.fillRect(0, 0, size, size);
        break;
      }
      case 'starfield': {
        ctx.fillStyle = '#04040e'; ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 350; i++) {
          const x = rng() * size, y = rng() * size, r = rng() * 1.8 + 0.3;
          const b = Math.floor(rng() * 100 + 155);
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 25)})`; ctx.fill();
        }
        break;
      }
      case 'sunset': {
        const g = ctx.createLinearGradient(0, 0, 0, size);
        g.addColorStop(0, '#080025'); g.addColorStop(0.35, '#2a0068');
        g.addColorStop(0.6, '#cc2200'); g.addColorStop(0.78, '#ff7700');
        g.addColorStop(1, '#ffcc33');
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
        break;
      }
      case 'neon': {
        ctx.fillStyle = '#030310'; ctx.fillRect(0, 0, size, size);
        const neonColors = ['#ff00ff', '#00ffff', '#ff6600', '#00ff88', '#ff0066'];
        for (let i = 0; i < 12; i++) {
          const x1 = rng() * size, y1 = rng() * size, x2 = rng() * size, y2 = rng() * size;
          const c = neonColors[Math.floor(rng() * neonColors.length)];
          ctx.strokeStyle = c; ctx.lineWidth = 0.8 + rng() * 2.5;
          ctx.globalAlpha = 0.25 + rng() * 0.45;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  setup(ctx: PipeSetupContext) {
    this.sceneRef = ctx.scene;
    const { style = 'gradient', seed = 42 } = this.params;
    this.texture = this.buildTexture(style, seed);
    this.lastStyle = style; this.lastSeed = seed;
    ctx.scene.environment = this.texture;
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!mesh || !this.texture) return;
    const intensity = this.params.intensity ?? 1.5;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) { mat.envMap = this.texture; mat.envMapIntensity = intensity; mat.needsUpdate = true; }
      }
    });
  }

  update(ctx: PipeFrameContext) {
    const { style = 'gradient', seed = 42, intensity = 1.5 } = this.params;
    if (style !== this.lastStyle || seed !== this.lastSeed) {
      this.texture?.dispose();
      this.texture = this.buildTexture(style, seed);
      this.lastStyle = style; this.lastSeed = seed;
      if (this.sceneRef) this.sceneRef.environment = this.texture;
      if (ctx.mesh) this.onMeshChanged(ctx.mesh, ctx);
    } else if (ctx.mesh) {
      ctx.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial && mat.envMapIntensity !== intensity) mat.envMapIntensity = intensity;
        }
      });
    }
  }

  dispose() { this.texture?.dispose(); this.texture = null; }
}
