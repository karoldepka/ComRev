import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface WingsPipeParams {
  style?: 'angel' | 'butterfly' | 'bat' | 'straight';
  color?: number;
  size?: number;
  longLength?: number;
  shortLength?: number;
  /** Fraction of the text's full bounding-box height used as the wing span (1 = full height). */
  heightScale?: number;
  flapSpeed?: number;
  flapAmplitude?: number;
  opacity?: number;
  layout?: 'horizontal' | 'vertical' | 'both';
  symmetric?: boolean;
  leftEnabled?: boolean;
  rightEnabled?: boolean;
  topEnabled?: boolean;
  bottomEnabled?: boolean;
}

export class WingsPipe implements EffectPipe {
  readonly name = 'wings';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private sides: {
    [key: string]: {
      group: THREE.Group;
      wing1: THREE.Group;
      wing2: THREE.Group | null;
    };
  } = {};
  private halfWidth = 2;
  private attachmentY = 0;
  private textHalfHeight = 1;

  constructor(public params: WingsPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    this.buildWings();
    ctx.scene.add(this.group);
  }

  private clearWingMeshes() {
    for (const side of Object.values(this.sides)) {
      side.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else (obj.material as THREE.Material).dispose();
        }
      });
      this.group?.remove(side.group);
    }
    this.sides = {};
  }

  private buildWings() {
    const {
      style = 'angel',
      color = 0xffffff,
      size = 2.5,
      opacity = 0.88,
      layout = 'horizontal',
      symmetric = false,
    } = this.params;

    const longLength = this.params.longLength ?? 1.4;
    const shortLength = this.params.shortLength ?? 0.45;

    // Determine which sides are enabled
    const leftEnabled = this.params.leftEnabled ?? (layout !== 'vertical');
    const rightEnabled = this.params.rightEnabled ?? (layout !== 'vertical');
    const topEnabled = this.params.topEnabled ?? (layout === 'vertical' || layout === 'both');
    const bottomEnabled = this.params.bottomEnabled ?? (layout === 'vertical' || layout === 'both');

    const enabledSides = {
      left: leftEnabled,
      right: rightEnabled,
      top: topEnabled,
      bottom: bottomEnabled,
    };

    this.clearWingMeshes();

    const meshes = this.makeWingMeshes(size, style, color, opacity, longLength, shortLength);

    for (const [sideName, enabled] of Object.entries(enabledSides)) {
      if (!enabled) continue;

      const sideGroup = new THREE.Group();
      this.group!.add(sideGroup);

      const wing1 = new THREE.Group();
      sideGroup.add(wing1);
      for (const m of meshes) {
        wing1.add(m.clone(true));
      }

      // Set scale and rotation for wing1
      if (sideName === 'left') {
        wing1.scale.set(-1, 1, 1);
      } else if (sideName === 'top') {
        wing1.rotation.z = Math.PI / 2;
      } else if (sideName === 'bottom') {
        wing1.rotation.z = -Math.PI / 2;
      }

      let wing2: THREE.Group | null = null;
      if (symmetric) {
        wing2 = new THREE.Group();
        sideGroup.add(wing2);
        for (const m of meshes) {
          wing2.add(m.clone(true));
        }

        // Set scale and rotation for wing2
        if (sideName === 'right') {
          wing2.scale.set(1, -1, 1);
        } else if (sideName === 'left') {
          wing2.scale.set(-1, -1, 1);
        } else if (sideName === 'top') {
          wing2.rotation.z = Math.PI / 2;
          wing2.scale.set(1, -1, 1);
        } else if (sideName === 'bottom') {
          wing2.rotation.z = -Math.PI / 2;
          wing2.scale.set(1, -1, 1);
        }
      }

      this.sides[sideName] = {
        group: sideGroup,
        wing1,
        wing2,
      };
    }

    this.positionSides();
  }

  private positionSides() {
    for (const [sideName, side] of Object.entries(this.sides)) {
      if (sideName === 'left') {
        side.group.position.set(-this.halfWidth, this.attachmentY, 0);
      } else if (sideName === 'right') {
        side.group.position.set(this.halfWidth, this.attachmentY, 0);
      } else if (sideName === 'top') {
        side.group.position.set(0, this.attachmentY + this.textHalfHeight, 0);
      } else if (sideName === 'bottom') {
        side.group.position.set(0, this.attachmentY - this.textHalfHeight, 0);
      }
    }
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

  private makeWingMeshes(size: number, style: string, color: number, opacity: number, longLength: number, shortLength: number): THREE.Mesh[] {
    if (style === 'butterfly') return this.makeButterfly(size, color, opacity, longLength, shortLength);
    if (style === 'bat')       return this.makeBat(size, color, opacity, longLength, shortLength);
    if (style === 'straight')  return this.makeStraight(size, color, opacity, longLength, shortLength);
    return this.makeAngel(size, color, opacity, longLength, shortLength);
  }

  private makeAngel(size: number, color: number, opacity: number, longLength: number, shortLength: number): THREE.Mesh[] {
    const bodyScale = longLength / 1.4;
    const body = new THREE.Shape();
    body.moveTo(0, 0);
    body.bezierCurveTo(size * 0.12, size * 0.55 * bodyScale, size * 0.55, size * 1.15 * bodyScale, size * 1.25, size * 0.9 * bodyScale);
    body.bezierCurveTo(size * 1.65, size * 0.5 * bodyScale, size * 1.6, -size * 0.08, size * 1.25, -size * 0.14);
    body.bezierCurveTo(size * 0.85, -size * 0.38, size * 0.38, -size * 0.42, size * 0.08, -size * 0.18);
    body.bezierCurveTo(size * 0.02, -size * 0.08, 0, -size * 0.02, 0, 0);
    const bodyMesh = new THREE.Mesh(new THREE.ShapeGeometry(body, 20), this.mat(color, opacity * 0.55));

    const feathers: THREE.Mesh[] = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const len = size * (shortLength + t * (longLength - shortLength));
      const w = size * 0.16;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(w * 0.55, len * 0.32, w * 0.45, len * 0.72, 0, len);
      shape.bezierCurveTo(-w * 0.45, len * 0.72, -w * 0.55, len * 0.32, 0, 0);
      const feather = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10), this.mat(color, opacity, 0.12));
      feather.rotation.z = -0.3 + t * 0.9;
      feather.position.set(size * (0.08 + t * 0.95), size * (-0.12 - t * 0.06), 0.01 + i * 0.005);
      feathers.push(feather);
    }

    return [bodyMesh, ...feathers];
  }

  private makeButterfly(size: number, color: number, opacity: number, longLength: number, shortLength: number): THREE.Mesh[] {
    const m = this.mat(color, opacity * 0.9, 0.18);
    const ls = longLength / 1.4;
    const ss = shortLength / 0.45;

    const upper = new THREE.Shape();
    upper.moveTo(0, 0);
    upper.bezierCurveTo(size * 0.2, size * 0.38 * ls, size * 0.65, size * 0.98 * ls, size * 1.35, size * 0.75 * ls);
    upper.bezierCurveTo(size * 1.68, size * 0.38 * ls, size * 1.58, size * 0.04, size * 0.98, size * 0.2);
    upper.bezierCurveTo(size * 0.48, size * 0.3, size * 0.12, size * 0.08, 0, 0);

    const lower = new THREE.Shape();
    lower.moveTo(0, 0);
    lower.bezierCurveTo(size * 0.14, -size * 0.18 * ss, size * 0.48, -size * 0.75 * ss, size * 1.05, -size * 0.65 * ss);
    lower.bezierCurveTo(size * 1.3, -size * 0.42 * ss, size * 1.25, -size * 0.08, size * 0.85, size * 0.05);
    lower.bezierCurveTo(size * 0.42, size * 0.15, size * 0.1, size * 0.04, 0, 0);

    return [
      new THREE.Mesh(new THREE.ShapeGeometry(upper, 18), m),
      new THREE.Mesh(new THREE.ShapeGeometry(lower, 18), m.clone()),
    ];
  }

  private makeBat(size: number, color: number, opacity: number, longLength: number, shortLength: number): THREE.Mesh[] {
    const m = this.mat(color, opacity, 0.02);
    const ll = longLength * size;
    const sl = shortLength * size;
    const mid = (ll + sl) * 0.55; // control-point height between fingers
    const wing = new THREE.Shape();
    wing.moveTo(0, 0);
    wing.lineTo(size * 0.28, sl * 0.52);
    wing.lineTo(size * 0.52, ll);                                                        // long finger 1
    wing.quadraticCurveTo(size * 0.76, mid * 1.1, size * 0.98, sl);                    // valley → short finger 2
    wing.quadraticCurveTo(size * 1.18, mid * 1.05, size * 1.42, ll * 0.82);            // valley → long finger 3
    wing.quadraticCurveTo(size * 1.62, mid * 0.9,  size * 1.78, sl * 0.78);            // valley → short finger 4
    wing.bezierCurveTo(size * 1.95, size * 0.08, size * 1.68, -size * 0.52, size * 0.88, -size * 0.32);
    wing.bezierCurveTo(size * 0.48, -size * 0.18, size * 0.14, -size * 0.04, 0, 0);
    return [new THREE.Mesh(new THREE.ShapeGeometry(wing, 22), m)];
  }

  // Straight rays arranged vertically along the full text height, alternating longLength/shortLength.
  private makeStraight(size: number, color: number, opacity: number, longLength: number, shortLength: number): THREE.Mesh[] {
    const rayCount = 7;
    const halfH = this.textHalfHeight * (this.params.heightScale ?? 0.6);
    const meshes: THREE.Mesh[] = [];

    for (let i = 0; i < rayCount; i++) {
      const t = i / (rayCount - 1);
      const isLong = i % 2 === 0;
      const len = size * (isLong ? longLength : shortLength);
      const y = halfH * (1 - 2 * t);               // +halfH (top) → -halfH (bottom)
      const angle = (0.5 - t) * 0.28;              // slight upward tilt at top, downward at bottom
      const w = size * (isLong ? 0.10 : 0.075);

      const shape = new THREE.Shape();
      shape.moveTo(0, -w * 0.5);
      shape.lineTo(len * 0.72, -w * 0.22);
      shape.lineTo(len, 0);
      shape.lineTo(len * 0.72, w * 0.22);
      shape.lineTo(0, w * 0.5);
      shape.closePath();

      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape, 1),
        this.mat(color, opacity * (isLong ? 0.9 : 0.72), isLong ? 0.13 : 0.06),
      );
      mesh.position.set(0, y, i * 0.003);
      mesh.rotation.z = angle;
      meshes.push(mesh);
    }
    return meshes;
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!mesh) { this.halfWidth = 2; this.attachmentY = 0; this.textHalfHeight = 1; return; }
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const meshPos = new THREE.Vector3();
    mesh.getWorldPosition(meshPos);
    this.halfWidth = (bbox.max.x - bbox.min.x) * 0.5;
    this.attachmentY = center.y - meshPos.y;
    const newHalfHeight = (bbox.max.y - bbox.min.y) * 0.5;
    this.textHalfHeight = newHalfHeight;
    this.buildWings();
  }

  update(ctx: PipeFrameContext) {
    const mesh = ctx.mesh;
    if (!mesh || !this.group) return;

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    mesh.getWorldPosition(pos);
    mesh.getWorldQuaternion(quat);
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);

    this.positionSides();

    const { flapSpeed = 2.5, flapAmplitude = 0.45 } = this.params;
    const angle = Math.sin(ctx.time * flapSpeed) * flapAmplitude;

    for (const [sideName, side] of Object.entries(this.sides)) {
      if (sideName === 'right') {
        side.wing1.rotation.z = angle;
        if (side.wing2) side.wing2.rotation.z = -angle;
      } else if (sideName === 'left') {
        side.wing1.rotation.z = -angle;
        if (side.wing2) side.wing2.rotation.z = angle;
      } else if (sideName === 'top') {
        side.wing1.rotation.z = Math.PI / 2 + angle;
        if (side.wing2) side.wing2.rotation.z = Math.PI / 2 - angle;
      } else if (sideName === 'bottom') {
        side.wing1.rotation.z = -Math.PI / 2 - angle;
        if (side.wing2) side.wing2.rotation.z = -Math.PI / 2 + angle;
      }
    }
  }

  dispose() {
    this.clearWingMeshes();
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null;
  }
}
