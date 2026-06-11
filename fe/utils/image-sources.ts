/** Utility functions for the 4 image source modes. */

// ── Color scheme (multi-step gradient) ───────────────────────────────────────

export interface ColorStop { pos: number; r: number; g: number; b: number; }
export type ColorScheme = ColorStop[];

export const PRESET_SCHEMES: Record<string, ColorScheme> = {
  fire:        [{ pos: 0, r: 0, g: 0, b: 0 }, { pos: 0.33, r: 220, g: 0, b: 0 }, { pos: 0.66, r: 255, g: 165, b: 0 }, { pos: 1, r: 255, g: 255, b: 200 }],
  ice:         [{ pos: 0, r: 0, g: 0, b: 40 }, { pos: 0.5, r: 0, g: 120, b: 220 }, { pos: 1, r: 200, g: 240, b: 255 }],
  psychedelic: [{ pos: 0, r: 255, g: 0, b: 128 }, { pos: 0.25, r: 0, g: 255, b: 200 }, { pos: 0.5, r: 128, g: 0, b: 255 }, { pos: 0.75, r: 255, g: 200, b: 0 }, { pos: 1, r: 255, g: 0, b: 128 }],
  electric:    [{ pos: 0, r: 0, g: 0, b: 0 }, { pos: 0.4, r: 0, g: 80, b: 255 }, { pos: 0.7, r: 120, g: 0, b: 255 }, { pos: 1, r: 255, g: 255, b: 255 }],
  forest:      [{ pos: 0, r: 0, g: 20, b: 0 }, { pos: 0.5, r: 0, g: 140, b: 40 }, { pos: 1, r: 180, g: 230, b: 80 }],
  ocean:       [{ pos: 0, r: 0, g: 0, b: 40 }, { pos: 0.4, r: 0, g: 60, b: 180 }, { pos: 0.7, r: 0, g: 160, b: 200 }, { pos: 1, r: 160, g: 230, b: 255 }],
  sunset:      [{ pos: 0, r: 10, g: 0, b: 30 }, { pos: 0.3, r: 200, g: 0, b: 80 }, { pos: 0.6, r: 255, g: 120, b: 0 }, { pos: 0.85, r: 255, g: 220, b: 80 }, { pos: 1, r: 255, g: 255, b: 220 }],
  neon:        [{ pos: 0, r: 0, g: 0, b: 0 }, { pos: 0.25, r: 0, g: 255, b: 120 }, { pos: 0.5, r: 255, g: 0, b: 255 }, { pos: 0.75, r: 0, g: 200, b: 255 }, { pos: 1, r: 255, g: 255, b: 0 }],
  lava:        [{ pos: 0, r: 10, g: 0, b: 0 }, { pos: 0.3, r: 180, g: 20, b: 0 }, { pos: 0.6, r: 255, g: 100, b: 0 }, { pos: 0.85, r: 255, g: 240, b: 80 }, { pos: 1, r: 255, g: 255, b: 255 }],
  grayscale:   [{ pos: 0, r: 0, g: 0, b: 0 }, { pos: 1, r: 255, g: 255, b: 255 }],
};
export const SCHEME_NAMES = Object.keys(PRESET_SCHEMES) as (keyof typeof PRESET_SCHEMES)[];

export function sampleScheme(scheme: ColorScheme, t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  let lo = scheme[0], hi = scheme[scheme.length - 1];
  for (let i = 0; i < scheme.length - 1; i++) {
    if (clamped >= scheme[i].pos && clamped <= scheme[i + 1].pos) {
      lo = scheme[i]; hi = scheme[i + 1]; break;
    }
  }
  const span = hi.pos - lo.pos || 1;
  const f = (clamped - lo.pos) / span;
  return [
    Math.round(lo.r + f * (hi.r - lo.r)),
    Math.round(lo.g + f * (hi.g - lo.g)),
    Math.round(lo.b + f * (hi.b - lo.b)),
  ];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 1 / 6) { r = c; g = x; }
  else if (h < 2 / 6) { r = x; g = c; }
  else if (h < 3 / 6) { g = c; b = x; }
  else if (h < 4 / 6) { g = x; b = c; }
  else if (h < 5 / 6) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// ── Fractal ───────────────────────────────────────────────────────────────────

export type FractalType = 'mandelbrot' | 'julia' | 'burningShip' | 'tricorn';

export interface FractalParams {
  type: FractalType;
  scheme: string;
  customScheme?: ColorScheme;
  maxIter: number;
  zoom: number;
  cx: number;
  cy: number;
  juliaRe: number;
  juliaIm: number;
  size: number;
}

export function renderFractal(canvas: HTMLCanvasElement, params: FractalParams): void {
  const { type, maxIter, zoom, cx, cy, juliaRe, juliaIm } = params;
  const scheme = params.customScheme ?? PRESET_SCHEMES[params.scheme] ?? PRESET_SCHEMES.psychedelic;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let re = (px - w / 2) / (zoom * Math.min(w, h)) + cx;
      let im = (py - h / 2) / (zoom * Math.min(w, h)) + cy;
      let zr = type === 'julia' ? re : 0;
      let zi = type === 'julia' ? im : 0;
      const cr = type === 'julia' ? juliaRe : re;
      const ci = type === 'julia' ? juliaIm : im;

      let iter = 0;
      while (iter < maxIter) {
        const zr2 = zr * zr, zi2 = zi * zi;
        if (zr2 + zi2 > 4) break;
        if (type === 'burningShip') {
          zr = zr2 - zi2 + cr;
          zi = Math.abs(2 * zr * zi) + ci;
        } else if (type === 'tricorn') {
          zr = zr2 - zi2 + cr;
          zi = -2 * zr * zi + ci;
        } else {
          zr = zr2 - zi2 + cr;
          zi = 2 * zr * zi + ci;
        }
        iter++;
      }

      const idx = (py * w + px) * 4;
      if (iter === maxIter) {
        data[idx] = data[idx + 1] = data[idx + 2] = 0;
      } else {
        const smooth = iter + 1 - Math.log(Math.log(Math.sqrt(zr * zr + zi * zi))) / Math.log(2);
        const t = Math.max(0, Math.min(1, smooth / maxIter));
        const [r, g, b] = sampleScheme(scheme, t);
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = b;
      }
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ── Plasma ────────────────────────────────────────────────────────────────────

export interface PlasmaParams { scale: number; scheme: string; customScheme?: ColorScheme; }

export function renderPlasma(canvas: HTMLCanvasElement, time: number, params: PlasmaParams): void {
  const scheme = params.customScheme ?? PRESET_SCHEMES[params.scheme] ?? PRESET_SCHEMES.psychedelic;
  const { scale } = params;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / w, fy = y / h;
      let v = Math.sin(fx * scale + time * 1.4);
      v += Math.sin(fy * scale * 0.9 + time * 1.1);
      v += Math.sin((fx + fy) * scale * 0.65 + time * 0.75);
      v += Math.sin(Math.sqrt((fx - 0.5) ** 2 + (fy - 0.5) ** 2) * scale * 2.5 - time * 1.2);
      const t = (Math.sin(v * 1.5) + 1) / 2;
      const [r, g, b] = sampleScheme(scheme, t);
      const idx = (y * w + x) * 4;
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ── Fire ──────────────────────────────────────────────────────────────────────

export interface FireParams { scheme: string; customScheme?: ColorScheme; }

export class FireState {
  buffer: Uint8Array;
  constructor(public width: number, public height: number) {
    this.buffer = new Uint8Array(width * height);
  }

  step() {
    const { width: w, height: h, buffer } = this;
    for (let x = 0; x < w; x++) {
      buffer[(h - 1) * w + x] = Math.random() < 0.55
        ? 255
        : 180 + Math.floor(Math.random() * 75);
    }
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const l = buffer[(y + 1) * w + Math.max(0, x - 1)];
        const c = buffer[(y + 1) * w + x];
        const r = buffer[(y + 1) * w + Math.min(w - 1, x + 1)];
        const decay = Math.floor(Math.random() * 4);
        buffer[y * w + x] = Math.max(0, Math.round((l + c + r) / 3) - decay);
      }
    }
  }

  render(canvas: HTMLCanvasElement, params: FireParams) {
    const scheme = params.customScheme ?? PRESET_SCHEMES[params.scheme] ?? PRESET_SCHEMES.fire;
    const { width: w, height: h, buffer } = this;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = sampleScheme(scheme, buffer[i] / 255);
      const idx = i * 4;
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

// ── Fireworks ─────────────────────────────────────────────────────────────────

export interface FireworksParams { scheme: string; customScheme?: ColorScheme; trailAlpha: number; particleCount: number; }

interface FWParticle {
  x: number; y: number; vx: number; vy: number;
  life: number; h: number;
}

export class FireworksState {
  particles: FWParticle[] = [];
  time = 0;

  update(w: number, h: number, dt: number, params: FireworksParams) {
    this.time += dt;
    const burstRate = params.particleCount / 100;
    if (Math.random() < dt * burstRate * 1.5) {
      const cx = w * (0.15 + Math.random() * 0.7);
      const cy = h * (0.1 + Math.random() * 0.5);
      const hue = Math.random();
      const count = Math.round(params.particleCount * (0.5 + Math.random() * 0.8));
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 0.6 + Math.random() * 4;
        this.particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, h: hue });
      }
    }
    this.particles = this.particles.filter(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.07; p.vx *= 0.98;
      p.life -= dt * 0.8;
      return p.life > 0;
    });
  }

  render(canvas: HTMLCanvasElement, params: FireworksParams) {
    const scheme = params.customScheme ?? PRESET_SCHEMES[params.scheme] ?? PRESET_SCHEMES.neon;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `rgba(0,0,0,${params.trailAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const p of this.particles) {
      const [r, g, b] = sampleScheme(scheme, p.h);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.life})`;
      ctx.fill();
    }
  }

  renderStatic(canvas: HTMLCanvasElement, params: FireworksParams) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Simulate a few bursts
    for (let b = 0; b < 5; b++) this.update(w, h, 0.1, params);
    for (let f = 0; f < 40; f++) {
      this.update(w, h, 0.05, params);
      this.render(canvas, params);
    }
  }
}

// ── AI Image (pollinations.ai) ────────────────────────────────────────────────

export async function generateAiImage(prompt: string, seed: number, size = 512): Promise<string> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${size}&height=${size}&seed=${seed}&nologo=true&model=flux`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`AI image generation failed: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Icon search (Iconify — covers Noun Project + 100+ icon sets) ──────────────

export interface IconResult {
  id: string;
  prefix: string;
  name: string;
}

export async function searchIcons(query: string): Promise<IconResult[]> {
  const url = `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=40`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Icon search failed: ${res.status}`);
  const data = await res.json();
  return ((data.icons as string[]) ?? []).map((id: string) => {
    const [prefix, ...rest] = id.split(':');
    return { id, prefix, name: rest.join(':') };
  });
}

export function iconSvgUrl(icon: IconResult): string {
  return `https://api.iconify.design/${icon.prefix}/${icon.name}.svg`;
}

export async function fetchIconSvg(icon: IconResult): Promise<string> {
  const res = await fetch(iconSvgUrl(icon));
  if (!res.ok) throw new Error(`Failed to fetch SVG: ${res.status}`);
  return res.text();
}
