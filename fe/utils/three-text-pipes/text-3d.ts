import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';
import { createTextGeometry } from '../three-text-geometry';

export interface Text3dPipeParams {
  text?: string;
  fontFamily?: string;
  size?: number;
  height?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
  color?: number;
  metalness?: number;
  roughness?: number;
  envMapIntensity?: number;
  equalizeLineWidths?: boolean;
  equalizationMethod?: 'spacing' | 'fontSize';
  targetWidth?: number;
  lineSpacing?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
}

export class Text3dPipe implements EffectPipe {
  readonly name = 'text3d';
  effectInstanceId?: string;
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private currentMesh: THREE.Object3D | null = null;
  private lastParamsJSON = '';

  constructor(public params: Text3dPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    if (this.effectInstanceId) this.group.userData.effectInstanceId = this.effectInstanceId;
    this.scene.add(this.group);
    this.rebuildMesh();
  }

  async rebuildMesh() {
    if (!this.group || !this.scene) return;

    const paramsJSON = JSON.stringify(this.params);
    if (paramsJSON === this.lastParamsJSON) return;
    this.lastParamsJSON = paramsJSON;

    // Remove old mesh
    if (this.currentMesh) {
      this.group.remove(this.currentMesh);
      this.currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
          else child.material?.dispose();
        }
      });
      this.currentMesh = null;
    }

    const {
      text = 'Text 3D',
      fontFamily,
      size = 2,
      height = 0.8,
      curveSegments = 12,
      bevelEnabled = true,
      bevelThickness = 0.15,
      bevelSize = 0.08,
      bevelOffset = 0,
      bevelSegments = 5,
      color = 0xff6600,
      metalness = 0.95,
      roughness = 0.15,
      envMapIntensity = 1.5,
      equalizeLineWidths = false,
      equalizationMethod = 'fontSize',
      targetWidth = 20,
      lineSpacing = 1.0,
      posX = 0,
      posY = 0,
      posZ = 0,
      rotX = 0,
      rotY = 0,
      rotZ = 0,
    } = this.params;

    try {
      const envMap = this.scene.environment;
      const { geometry, material } = await createTextGeometry({
        text,
        fontFamily,
        size,
        height,
        curveSegments,
        bevelEnabled,
        bevelThickness,
        bevelSize,
        bevelOffset,
        bevelSegments,
        color: new THREE.Color(color),
        metalness,
        roughness,
        envMap,
        envMapIntensity,
        equalizeLineWidths,
        equalizationMethod,
        targetWidth,
        lineSpacing,
      });

      let mesh: THREE.Mesh | THREE.Group;
      if (geometry instanceof THREE.Group) {
        mesh = geometry;
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      } else {
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }

      mesh.position.set(posX, posY, posZ);
      mesh.rotation.set(rotX, rotY, rotZ);

      this.group.add(mesh);
      this.currentMesh = mesh;
    } catch (err) {
      console.error('Text3dPipe rebuild mesh failed:', err);
    }
  }

  update(ctx: PipeFrameContext) {
    this.rebuildMesh();
  }

  dispose() {
    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }
    if (this.currentMesh) {
      this.currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
          else child.material?.dispose();
        }
      });
    }
    this.group = null;
    this.currentMesh = null;
  }
}
