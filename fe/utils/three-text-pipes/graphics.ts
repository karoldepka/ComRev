import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

export interface GraphicItem {
  id: string;
  name: string;
  type: 'svg' | 'image';
  content: string; // SVG XML string or base64 Image data URL
}

export type GraphicsEnvMapStyle = 'none' | 'gradient' | 'studio' | 'starfield' | 'sunset' | 'neon' | 'custom';

export interface GraphicsPipeParams {
  items?: GraphicItem[];
  layout?: 'grid' | 'row' | 'pile';
  spacing?: number;
  /** Number of columns for grid layout (0 or undefined = auto) */
  columns?: number;
  /** Minimum edge-to-edge gap between items in grid layout */
  gap?: number;
  scale?: number;
  extrudeDepth?: number;
  // Bevel controls (for SVG extrusion)
  bevelEnabled?: boolean;
  bevelSize?: number;
  bevelThickness?: number;
  bevelSegments?: number;
  // Material
  colorOverride?: boolean;
  color?: number;
  metalness?: number;
  roughness?: number;
  // Background plane behind the graphics
  bgEnabled?: boolean;
  bgColor?: number;
  bgOpacity?: number;
  // Image texture applied to SVG material surface
  matImageDataUrl?: string;
  // Per-graphics environment map for reflections
  envMapStyle?: GraphicsEnvMapStyle;
  envMapIntensity?: number;
  envMapCustomDataUrl?: string;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  effectInstanceId?: string;
}

export class GraphicsPipe implements EffectPipe {
  readonly name = 'graphics';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private renderer: any = null;
  private meshes: THREE.Object3D[] = [];
  private bgMesh: THREE.Mesh | null = null;
  private envTexture: THREE.Texture | null = null;
  private matImageTexture: THREE.Texture | null = null;
  private lastParamsJSON = '';
  private lastEnvStyle = '';
  private lastEnvSeed = -1;
  private lastEnvCustomUrl = '';
  private lastMatImageUrl = '';
  private rebuilding = false;
  private dirtyAfterRebuild = false;

  constructor(public params: GraphicsPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.renderer = ctx.renderer;
    this.group = new THREE.Group();
    if (this.params.effectInstanceId) {
      this.group.userData.effectInstanceId = this.params.effectInstanceId;
    }
    this.scene.add(this.group);
    this.startRebuild();
  }

  // ── Procedural env-map builder (mirrors EnvMapPipe styles) ───────────────────

  private buildEnvTexture(style: Exclude<GraphicsEnvMapStyle, 'none' | 'custom'>, seed: number): THREE.Texture {
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
    if (this.renderer) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      const processed = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
      tex.dispose();
      return processed;
    }
    return tex;
  }

  private loadCustomEnvTexture(dataUrl: string) {
    new THREE.TextureLoader().load(
      dataUrl,
      (tex) => {
        this.lastEnvCustomUrl = dataUrl;
        if (this.renderer) {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(this.renderer);
          pmrem.compileEquirectangularShader();
          const processed = pmrem.fromEquirectangular(tex).texture;
          pmrem.dispose();
          tex.dispose();
          this.envTexture?.dispose();
          this.envTexture = processed;
        } else {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          this.envTexture?.dispose();
          this.envTexture = tex;
        }
        this.applyEnvMapToGroup();
      },
      undefined,
      (err) => console.error('GraphicsPipe: failed to load custom env image', err),
    );
  }

  private loadMatImageTexture(dataUrl: string) {
    new THREE.TextureLoader().load(
      dataUrl,
      (tex) => {
        this.lastMatImageUrl = dataUrl;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.matImageTexture?.dispose();
        this.matImageTexture = tex;
        this.applyMatImageToGroup();
      },
      undefined,
      (err) => console.error('GraphicsPipe: failed to load mat image', err),
    );
  }

  private applyEnvMapToGroup() {
    if (!this.group) return;
    const { envMapStyle = 'none', envMapIntensity = 1.5 } = this.params;
    const hasEnv = envMapStyle !== 'none' && this.envTexture != null;
    this.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) return;
      mat.envMap = hasEnv ? this.envTexture : null;
      mat.envMapIntensity = hasEnv ? envMapIntensity : 0;
      mat.needsUpdate = true;
    });
  }

  private applyMatImageToGroup() {
    if (!this.group) return;
    const tex = this.params.matImageDataUrl ? this.matImageTexture : null;
    this.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) return;
      mat.map = tex;
      mat.needsUpdate = true;
    });
  }

  // ── Mesh builder ─────────────────────────────────────────────────────────────

  private async createMeshForItem(item: GraphicItem): Promise<THREE.Object3D> {
    const {
      extrudeDepth = 0.2,
      bevelEnabled = true,
      bevelSize = 0.02,
      bevelThickness = 0.02,
      bevelSegments = 3,
      colorOverride = false,
      color = 0xff6600,
      metalness = 0.8,
      roughness = 0.2,
    } = this.params;

    if (item.type === 'svg') {
      const loader = new SVGLoader();
      const svgData = loader.parse(item.content);
      const group = new THREE.Group();

      for (const path of svgData.paths) {
        const pathColor = colorOverride ? new THREE.Color(color) : (path.color || new THREE.Color(0xffffff));
        const material = new THREE.MeshStandardMaterial({
          color: pathColor,
          side: THREE.DoubleSide,
          metalness,
          roughness,
        });

        for (const shape of SVGLoader.createShapes(path)) {
          let geometry: THREE.BufferGeometry;
          if (extrudeDepth > 0) {
            geometry = new THREE.ExtrudeGeometry(shape, {
              depth: extrudeDepth,
              bevelEnabled,
              bevelSegments,
              steps: 1,
              bevelSize,
              bevelThickness,
            });
          } else {
            geometry = new THREE.ShapeGeometry(shape);
          }
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
      }

      // SVGLoader Y-down → flip Y
      group.scale.set(1, -1, 1);

      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      group.position.set(-center.x, -center.y, -center.z);

      const wrapper = new THREE.Group();
      wrapper.add(group);
      return wrapper;
    } else {
      // Raster image — preserve aspect ratio on a plane
      let aspect = 1;
      if (typeof window !== 'undefined') {
        try {
          const img = new Image();
          img.src = item.content;
          await new Promise<void>((resolve) => {
            img.onload = () => { aspect = img.naturalWidth / img.naturalHeight; resolve(); };
            img.onerror = () => resolve();
          });
        } catch {}
      }

      const texture = new THREE.TextureLoader().load(item.content);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        roughness,
        metalness: metalness * 0.1,
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3 * aspect, 3), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
  }

  // ── Background plane ─────────────────────────────────────────────────────────

  private updateBackground() {
    if (!this.group) return;
    const { bgEnabled = false, bgColor = 0x111111, bgOpacity = 0.8 } = this.params;

    if (bgEnabled && this.meshes.length > 0) {
      const box = new THREE.Box3();
      for (const m of this.meshes) box.expandByObject(m);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const bgW = Math.max(size.x + 2, 4);
      const bgH = Math.max(size.y + 2, 4);

      if (!this.bgMesh) {
        const mat = new THREE.MeshBasicMaterial({
          color: bgColor,
          transparent: bgOpacity < 1,
          opacity: bgOpacity,
          side: THREE.DoubleSide,
          depthWrite: bgOpacity >= 1,
        });
        this.bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(bgW, bgH), mat);
        this.group.add(this.bgMesh);
      } else {
        this.bgMesh.geometry.dispose();
        this.bgMesh.geometry = new THREE.PlaneGeometry(bgW, bgH);
        const mat = this.bgMesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(bgColor);
        mat.opacity = bgOpacity;
        mat.transparent = bgOpacity < 1;
        mat.depthWrite = bgOpacity >= 1;
      }
      // Position at z slightly behind the meshes
      this.bgMesh.position.set(center.x, center.y, box.min.z - 0.1);
    } else if (this.bgMesh) {
      this.group.remove(this.bgMesh);
      this.bgMesh.geometry.dispose();
      (this.bgMesh.material as THREE.Material).dispose();
      this.bgMesh = null;
    }
  }

  // ── Env / image texture update ───────────────────────────────────────────────

  private updateEnvAndImageTextures() {
    const {
      envMapStyle = 'none',
      envMapCustomDataUrl,
      matImageDataUrl,
    } = this.params;
    const seed = 42;

    if (envMapStyle === 'none') {
      if (this.envTexture) {
        this.envTexture.dispose();
        this.envTexture = null;
        this.lastEnvStyle = '';
        this.lastEnvSeed = -1;
        this.lastEnvCustomUrl = '';
      }
    } else if (envMapStyle === 'custom') {
      // Invalidate procedural cache so switching back always rebuilds
      this.lastEnvStyle = '';
      this.lastEnvSeed = -1;
      if (envMapCustomDataUrl && envMapCustomDataUrl !== this.lastEnvCustomUrl) {
        this.loadCustomEnvTexture(envMapCustomDataUrl);
        return; // apply happens in the loader callback
      }
    } else if (envMapStyle !== this.lastEnvStyle || seed !== this.lastEnvSeed) {
      // Switching away from custom: clear loaded texture
      this.lastEnvCustomUrl = '';
      this.envTexture?.dispose();
      this.envTexture = this.buildEnvTexture(envMapStyle, seed);
      this.lastEnvStyle = envMapStyle;
      this.lastEnvSeed = seed;
    }

    this.applyEnvMapToGroup();

    // Material image texture
    if (matImageDataUrl && matImageDataUrl !== this.lastMatImageUrl) {
      this.loadMatImageTexture(matImageDataUrl);
    } else if (!matImageDataUrl && this.matImageTexture) {
      this.matImageTexture.dispose();
      this.matImageTexture = null;
      this.lastMatImageUrl = '';
      this.applyMatImageToGroup();
    } else {
      this.applyMatImageToGroup();
    }
  }

  // ── Rebuild ───────────────────────────────────────────────────────────────────

  markDirty() {
    const paramsJSON = JSON.stringify(this.params);
    if (paramsJSON === this.lastParamsJSON) return;
    this.lastParamsJSON = paramsJSON;
    if (this.rebuilding) { this.dirtyAfterRebuild = true; return; }
    this.startRebuild();
  }

  private startRebuild() {
    this.rebuilding = true;
    this.dirtyAfterRebuild = false;
    this.rebuildGraphics().finally(() => {
      this.rebuilding = false;
      if (this.dirtyAfterRebuild) this.startRebuild();
    });
  }

  private async rebuildGraphics() {
    if (!this.group || !this.scene) return;

    // Clear old graphic meshes (not bgMesh)
    for (const mesh of this.meshes) {
      this.group.remove(mesh);
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
          else child.material?.dispose();
        }
      });
    }
    this.meshes = [];

    const {
      items = [],
      layout = 'row',
      spacing = 4,
      columns = 0,
      gap = 0.5,
      scale = 1,
      posX = 0,
      posY = 0,
      posZ = 0,
      rotX = 0,
      rotY = 0,
      rotZ = 0,
    } = this.params;

    if (items.length === 0) {
      this.updateBackground();
      this.updateEnvAndImageTextures();
      this.group.position.set(posX, posY, posZ);
      this.group.rotation.set(rotX, rotY, rotZ);
      return;
    }

    // Build meshes sequentially (each may be async for image loading)
    const loaded: THREE.Object3D[] = [];
    for (const item of items) {
      try {
        const mesh = await this.createMeshForItem(item);
        if (!this.group) return; // disposed while awaiting
        mesh.scale.setScalar(scale);
        this.group.add(mesh);
        loaded.push(mesh);
      } catch (err) {
        console.error('GraphicsPipe: failed to load graphic item:', item.name, err);
      }
    }

    if (!this.group) return;

    this.meshes = loaded;

    // Layout
    if (layout === 'row') {
      const totalWidth = (loaded.length - 1) * spacing;
      let startX = -totalWidth / 2;
      for (const mesh of loaded) {
        mesh.position.set(startX, 0, 0);
        startX += spacing;
      }
    } else if (layout === 'grid') {
      const cols = (columns > 0) ? columns : Math.ceil(Math.sqrt(loaded.length));
      const rows = Math.ceil(loaded.length / cols);

      const sizes = loaded.map((m) => new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()));

      const colWidths = Array.from({ length: cols }, (_, c) => {
        let max = 0;
        for (let r = 0; r < rows; r++) {
          const idx = r * cols + c;
          if (idx < sizes.length) max = Math.max(max, sizes[idx].x);
        }
        return max || spacing;
      });
      const rowHeights = Array.from({ length: rows }, (_, r) => {
        let max = 0;
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx < sizes.length) max = Math.max(max, sizes[idx].y);
        }
        return max || spacing;
      });

      const totalW = colWidths.reduce((a, b) => a + b, 0) + (cols - 1) * gap;
      const totalH = rowHeights.reduce((a, b) => a + b, 0) + (rows - 1) * gap;

      let curY = totalH / 2;
      for (let r = 0; r < rows; r++) {
        let curX = -totalW / 2;
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= loaded.length) break;
          loaded[idx].position.set(curX + colWidths[c] / 2, curY - rowHeights[r] / 2, 0);
          curX += colWidths[c] + gap;
        }
        curY -= rowHeights[r] + gap;
      }
    } else {
      // pile / stack
      loaded.forEach((mesh, idx) => { mesh.position.set(0, 0, idx * 0.2); });
    }

    this.group.position.set(posX, posY, posZ);
    this.group.rotation.set(rotX, rotY, rotZ);

    this.updateBackground();
    this.updateEnvAndImageTextures();
  }

  update(_ctx: PipeFrameContext) {
    this.markDirty();
  }

  dispose() {
    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }
    for (const mesh of this.meshes) {
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
          else child.material?.dispose();
        }
      });
    }
    if (this.bgMesh) {
      this.bgMesh.geometry.dispose();
      (this.bgMesh.material as THREE.Material).dispose();
      this.bgMesh = null;
    }
    this.envTexture?.dispose();
    this.envTexture = null;
    this.matImageTexture?.dispose();
    this.matImageTexture = null;
    this.group = null;
    this.meshes = [];
  }
}
