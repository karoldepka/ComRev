import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

export interface GraphicItem {
  id: string;
  name: string;
  type: 'svg' | 'image';
  content: string; // SVG XML string or base64 Image data URL
}

export interface GraphicsPipeParams {
  items?: GraphicItem[];
  layout?: 'grid' | 'row' | 'pile';
  spacing?: number;
  scale?: number;
  extrudeDepth?: number;
  colorOverride?: boolean;
  color?: number;
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
  private meshes: THREE.Object3D[] = [];
  private lastParamsJSON = '';
  private rebuilding = false;
  private dirtyAfterRebuild = false;

  constructor(public params: GraphicsPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    if (this.params.effectInstanceId) {
      this.group.userData.effectInstanceId = this.params.effectInstanceId;
    }
    this.scene.add(this.group);
    this.startRebuild();
  }

  private async createMeshForItem(item: GraphicItem): Promise<THREE.Object3D> {
    const {
      extrudeDepth = 0.2,
      colorOverride = false,
      color = 0xff6600,
    } = this.params;

    if (item.type === 'svg') {
      const loader = new SVGLoader();
      const svgData = loader.parse(item.content);
      const paths = svgData.paths;
      const group = new THREE.Group();

      for (const path of paths) {
        const pathColor = colorOverride ? new THREE.Color(color) : (path.color || new THREE.Color(0xffffff));
        const material = new THREE.MeshStandardMaterial({
          color: pathColor,
          side: THREE.DoubleSide,
          metalness: 0.8,
          roughness: 0.2,
        });

        const shapes = SVGLoader.createShapes(path);
        for (const shape of shapes) {
          let geometry: THREE.BufferGeometry;
          if (extrudeDepth > 0) {
            geometry = new THREE.ExtrudeGeometry(shape, {
              depth: extrudeDepth,
              bevelEnabled: true,
              bevelSegments: 3,
              steps: 1,
              bevelSize: 0.02,
              bevelThickness: 0.02,
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

      // SVGLoader coordinates are Y-down and X-right. Flip Y.
      group.scale.set(1, -1, 1);

      // Center the geometry
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      group.position.x = -center.x;
      group.position.y = -center.y;
      group.position.z = -center.z;

      // Wrap in a group to hold positioning
      const wrapper = new THREE.Group();
      wrapper.add(group);
      return wrapper;
    } else {
      // Image loading
      let aspect = 1;
      if (typeof window !== 'undefined') {
        try {
          const img = new Image();
          img.src = item.content;
          await new Promise((resolve) => {
            img.onload = () => {
              aspect = img.naturalWidth / img.naturalHeight;
              resolve(null);
            };
            img.onerror = () => resolve(null);
          });
        } catch {}
      }

      const texture = new THREE.TextureLoader().load(item.content);
      texture.colorSpace = THREE.SRGBColorSpace;

      const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.1,
      });

      const geometry = new THREE.PlaneGeometry(3 * aspect, 3);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      return mesh;
    }
  }

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

    // Clear old meshes
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
      scale = 1,
      posX = 0,
      posY = 0,
      posZ = 0,
      rotX = 0,
      rotY = 0,
      rotZ = 0,
    } = this.params;

    if (items.length === 0) return;

    // Create meshes (await per item — guard against disposal after each)
    const loadedMeshes: THREE.Object3D[] = [];
    for (const item of items) {
      try {
        const mesh = await this.createMeshForItem(item);
        if (!this.group) return; // disposed while awaiting
        mesh.scale.setScalar(scale);
        this.group.add(mesh);
        loadedMeshes.push(mesh);
      } catch (err) {
        console.error('Failed to load graphic item:', item.name, err);
      }
    }

    if (!this.group) return; // disposed while awaiting

    this.meshes = loadedMeshes;

    // Position them based on layout
    if (layout === 'row') {
      const totalWidth = (loadedMeshes.length - 1) * spacing;
      let startX = -totalWidth / 2;
      loadedMeshes.forEach((mesh) => {
        mesh.position.set(startX, 0, 0);
        startX += spacing;
      });
    } else if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(loadedMeshes.length));
      const rows = Math.ceil(loadedMeshes.length / cols);
      const startX = -((cols - 1) * spacing) / 2;
      const startY = ((rows - 1) * spacing) / 2;

      loadedMeshes.forEach((mesh, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        mesh.position.set(startX + c * spacing, startY - r * spacing, 0);
      });
    } else {
      // pile / stack
      loadedMeshes.forEach((mesh, idx) => {
        mesh.position.set(0, 0, idx * 0.2);
      });
    }

    this.group.position.set(posX, posY, posZ);
    this.group.rotation.set(rotX, rotY, rotZ);
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
    this.group = null;
    this.meshes = [];
  }
}
