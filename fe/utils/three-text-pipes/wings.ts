import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface WingsPipeParams {
  style?: 'angel' | 'butterfly' | 'bat';
  color?: number;
  size?: number;
  flapSpeed?: number;
  flapAmplitude?: number;
  opacity?: number;
}

export class WingsPipe implements EffectPipe {
  readonly name = 'wings';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private rightPivot: THREE.Group | null = null;
  private leftPivot: THREE.Group | null = null;
  private halfWidth = 2;
  private attachmentY = 0;

  constructor(public params: WingsPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    this.buildWings();
    ctx.scene.add(this.group);
  }

  private buildWings() {
    const { style = 'angel', color = 0xffffff, size = 2.5, opacity = 0.88 } = this.params;

    this.rightPivot = new THREE.Group();
    this.leftPivot = new THREE.Group();

    const meshes = this.makeWingMeshes(size, style, color, opacity);
    for (const m of meshes) {
      this.rightPivot.add(m);
      const mirrored = m.clone(true);
      mirrored.scale.x = -1;
      this.leftPivot.add(mirrored);
    }

    this.group!.add(this.rightPivot);
    this.group!.add(this.leftPivot);
  }

  private mat(color: number, opacity: number, emissive = 0.06): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity,
      emissive: new THREE.Color(color),
      emissiveIntensity: emissive,
      roughness: 0.65,
      metalness: 0.0,
      depthWrite: false,
    });
  }

  private makeWingMeshes(size: number, style: string, color: number, opacity: number): THREE.Mesh[] {
    if (style === 'butterfly') return this.makeButterfly(size, color, opacity);
    if (style === 'bat') return this.makeBat(size, color, opacity);
    return this.makeAngel(size, color, opacity);
  }

  private makeAngel(size: number, color: number, opacity: number): THREE.Mesh[] {
    // Main wing body — semi-transparent membrane
    const body = new THREE.Shape();
    body.moveTo(0, 0);
    body.bezierCurveTo(size * 0.12, size * 0.55, size * 0.55, size * 1.15, size * 1.25, size * 0.9);
    body.bezierCurveTo(size * 1.65, size * 0.5, size * 1.6, -size * 0.08, size * 1.25, -size * 0.14);
    body.bezierCurveTo(size * 0.85, -size * 0.38, size * 0.38, -size * 0.42, size * 0.08, -size * 0.18);
    body.bezierCurveTo(size * 0.02, -size * 0.08, 0, -size * 0.02, 0, 0);
    const bodyMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(body, 20),
      this.mat(color, opacity * 0.55),
    );

    // 6 primary feathers fanning from trailing edge
    const feathers: THREE.Mesh[] = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const len = size * (0.45 + t * 0.95);
      const w = size * 0.16;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(w * 0.55, len * 0.32, w * 0.45, len * 0.72, 0, len);
      shape.bezierCurveTo(-w * 0.45, len * 0.72, -w * 0.55, len * 0.32, 0, 0);
      const feather = new THREE.Mesh(
        new THREE.ShapeGeometry(shape, 10),
        this.mat(color, opacity, 0.12),
      );
      // Sweep from pointing upward (near body) to pointing outward (near tip)
      feather.rotation.z = -0.3 + t * 0.9;
      feather.position.set(size * (0.08 + t * 0.95), size * (-0.12 - t * 0.06), 0.01 + i * 0.005);
      feathers.push(feather);
    }

    return [bodyMesh, ...feathers];
  }

  private makeButterfly(size: number, color: number, opacity: number): THREE.Mesh[] {
    const m = this.mat(color, opacity * 0.9, 0.18);

    // Upper lobe (larger)
    const upper = new THREE.Shape();
    upper.moveTo(0, 0);
    upper.bezierCurveTo(size * 0.2, size * 0.38, size * 0.65, size * 0.98, size * 1.35, size * 0.75);
    upper.bezierCurveTo(size * 1.68, size * 0.38, size * 1.58, size * 0.04, size * 0.98, size * 0.2);
    upper.bezierCurveTo(size * 0.48, size * 0.3, size * 0.12, size * 0.08, 0, 0);

    // Lower lobe (smaller)
    const lower = new THREE.Shape();
    lower.moveTo(0, 0);
    lower.bezierCurveTo(size * 0.14, -size * 0.18, size * 0.48, -size * 0.75, size * 1.05, -size * 0.65);
    lower.bezierCurveTo(size * 1.3, -size * 0.42, size * 1.25, -size * 0.08, size * 0.85, size * 0.05);
    lower.bezierCurveTo(size * 0.42, size * 0.15, size * 0.1, size * 0.04, 0, 0);

    return [
      new THREE.Mesh(new THREE.ShapeGeometry(upper, 18), m),
      new THREE.Mesh(new THREE.ShapeGeometry(lower, 18), m.clone()),
    ];
  }

  private makeBat(size: number, color: number, opacity: number): THREE.Mesh[] {
    const m = this.mat(color, opacity, 0.02);
    const wing = new THREE.Shape();
    wing.moveTo(0, 0);
    wing.lineTo(size * 0.28, size * 0.48);
    wing.lineTo(size * 0.52, size * 1.02);
    wing.quadraticCurveTo(size * 0.76, size * 1.18, size * 0.98, size * 0.92);
    wing.quadraticCurveTo(size * 1.18, size * 1.12, size * 1.42, size * 0.82);
    wing.quadraticCurveTo(size * 1.62, size * 0.98, size * 1.78, size * 0.68);
    wing.bezierCurveTo(size * 1.95, size * 0.08, size * 1.68, -size * 0.52, size * 0.88, -size * 0.32);
    wing.bezierCurveTo(size * 0.48, -size * 0.18, size * 0.14, -size * 0.04, 0, 0);
    return [new THREE.Mesh(new THREE.ShapeGeometry(wing, 22), m)];
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!mesh) { this.halfWidth = 2; this.attachmentY = 0; return; }
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const meshPos = new THREE.Vector3();
    mesh.getWorldPosition(meshPos);
    this.halfWidth = (bbox.max.x - bbox.min.x) * 0.5;
    this.attachmentY = center.y - meshPos.y;
  }

  update(ctx: PipeFrameContext) {
    const mesh = ctx.mesh;
    if (!mesh || !this.group) return;

    // Sync to mesh world transform
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    mesh.getWorldPosition(pos);
    mesh.getWorldQuaternion(quat);
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);

    // Update attachment points in group-local space
    if (this.rightPivot) this.rightPivot.position.set(this.halfWidth, this.attachmentY, 0);
    if (this.leftPivot) this.leftPivot.position.set(-this.halfWidth, this.attachmentY, 0);

    // Flap
    const { flapSpeed = 2.5, flapAmplitude = 0.45 } = this.params;
    const angle = Math.sin(ctx.time * flapSpeed) * flapAmplitude;
    if (this.rightPivot) this.rightPivot.rotation.z = angle;
    if (this.leftPivot) this.leftPivot.rotation.z = -angle;
  }

  dispose() {
    this.group?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else (obj.material as THREE.Material).dispose();
      }
    });
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null;
    this.rightPivot = null;
    this.leftPivot = null;
  }
}
