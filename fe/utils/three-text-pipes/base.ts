import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let x = Math.imul(s ^ (s >>> 15), s | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Contexts ──────────────────────────────────────────────────────────────────
export interface PipeSetupContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: any;
  gl: any;
  width: number;
  height: number;
}

export interface PipeFrameContext extends PipeSetupContext {
  mesh: THREE.Mesh | THREE.Group | null;
  time: number;
  delta: number;
}

// ── EffectPipe interface ──────────────────────────────────────────────────────
export interface EffectPipe {
  readonly name: string;
  paused?: boolean;
  setup(ctx: PipeSetupContext): void;
  addComposerPass?(composer: EffectComposer, ctx: PipeSetupContext): void;
  update?(ctx: PipeFrameContext): void;
  onMeshChanged?(mesh: THREE.Mesh | THREE.Group | null, ctx: PipeSetupContext): void;
  restoreGeometry?(): void;
  /** Called after another deform pipe runs so this pipe sees the new vertex positions as its "original". */
  syncOriginalFromCurrentGeometry?(): void;
  dispose(): void;
}

// ── PipelineManager ───────────────────────────────────────────────────────────
export class PipelineManager {
  private composer: EffectComposer | null = null;
  private setupCtx: PipeSetupContext | null = null;
  private frozenTimes = new Map<EffectPipe, number>();

  constructor(public readonly pipes: EffectPipe[]) {}

  setup(ctx: PipeSetupContext) {
    this.setupCtx = ctx;
    const ppPipes = this.pipes.filter(p => p.addComposerPass);
    const hasExplicitSmaa = ppPipes.some(p => p.name === 'antialiasing');

    // Always use EffectComposer with an 8× multisampled render target (hardware MSAA).
    // This is equivalent to WebGLRenderer({ antialias: true, samples: 8 }) and gives
    // the strongest anti-aliasing available in the post-processing pipeline.
    const msaaTarget = new THREE.WebGLRenderTarget(ctx.width, ctx.height, { samples: 8 });
    this.composer = new EffectComposer(ctx.renderer, msaaTarget);
    this.composer.addPass(new RenderPass(ctx.scene, ctx.camera));
    for (const p of ppPipes) p.addComposerPass!(this.composer, ctx);
    // Add SMAA on top for edge smoothing unless the user already added one.
    if (!hasExplicitSmaa) {
      this.composer.addPass(new SMAAPass());
    }
    this.composer.addPass(new OutputPass());

    for (const p of this.pipes) p.setup(ctx);
  }

  render(ctx: PipeFrameContext) {
    if (this.composer) {
      this.composer.render(ctx.delta);
    } else {
      ctx.renderer.render(ctx.scene, ctx.camera);
    }
  }

  update(ctx: PipeFrameContext) {
    const n = this.pipes.length;
    for (let i = 0; i < n; i++) {
      const p = this.pipes[i];
      if (p.paused) {
        // Still apply effect each frame so geometry stays deformed; just freeze time.
        const frozenTime = this.frozenTimes.get(p) ?? ctx.time;
        p.update?.({ ...ctx, time: frozenTime, delta: 0 });
      } else {
        this.frozenTimes.set(p, ctx.time);
        p.update?.(ctx);
      }
      // After a deform pipe runs, update subsequent deform pipes' stored originals
      // so they see this pipe's output as their input (enables chaining).
      if (p.syncOriginalFromCurrentGeometry) {
        for (let j = i + 1; j < n; j++) {
          this.pipes[j].syncOriginalFromCurrentGeometry?.();
        }
      }
    }
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null) {
    if (!this.setupCtx) return;
    for (const p of this.pipes) p.onMeshChanged?.(mesh, this.setupCtx);
  }

  restoreGeometry() {
    for (const p of this.pipes) p.restoreGeometry?.();
  }

  resize(width: number, height: number) {
    if (this.setupCtx) this.setupCtx = { ...this.setupCtx, width, height };
    this.composer?.setSize(width, height);
  }

  dispose() {
    for (const p of this.pipes) p.dispose();
    this.composer?.dispose();
    this.composer = null;
    this.frozenTimes.clear();
  }
}

// ── Deform helpers ────────────────────────────────────────────────────────────
export interface MeshDeformState {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  originalPosition: Float32Array;
  originalNormal: Float32Array | null;
}

export function collectDeformableMeshStates(root: THREE.Object3D | null): MeshDeformState[] {
  const states: MeshDeformState[] = [];
  if (!root) return states;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    if (!(geometry instanceof THREE.BufferGeometry)) return;
    const positionAttr = geometry.attributes.position;
    if (!positionAttr) return;
    const originalPosition = new Float32Array(positionAttr.array as Float32Array);
    const normalAttr = geometry.attributes.normal;
    const originalNormal = normalAttr ? new Float32Array(normalAttr.array as Float32Array) : null;
    states.push({ mesh: child, geometry, originalPosition, originalNormal });
  });
  return states;
}

export function applyVertexDeformation(
  state: MeshDeformState,
  callback: (orig: THREE.Vector3, result: THREE.Vector3, index: number) => void,
) {
  const positionAttr = state.geometry.attributes.position;
  const array = positionAttr.array as Float32Array;
  const tempOrig = new THREE.Vector3();
  const tempResult = new THREE.Vector3();
  let vi = 0;

  for (let i = 0; i < array.length; i += 3) {
    tempOrig.set(state.originalPosition[i], state.originalPosition[i + 1], state.originalPosition[i + 2]);
    callback(tempOrig, tempResult, vi++);
    array[i] = tempResult.x;
    array[i + 1] = tempResult.y;
    array[i + 2] = tempResult.z;
  }

  positionAttr.needsUpdate = true;
  if (state.originalNormal && state.geometry.attributes.normal) {
    state.geometry.computeVertexNormals();
    state.geometry.attributes.normal.needsUpdate = true;
  }
}

export function restoreDeformStates(states: MeshDeformState[]) {
  for (const state of states) {
    const positionAttr = state.geometry.attributes.position;
    (positionAttr.array as Float32Array).set(state.originalPosition);
    positionAttr.needsUpdate = true;
    if (state.originalNormal && state.geometry.attributes.normal) {
      (state.geometry.attributes.normal.array as Float32Array).set(state.originalNormal);
      state.geometry.attributes.normal.needsUpdate = true;
    }
  }
}

export interface Aabb {
  cx: number; cy: number; cz: number;
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  sizeX: number; sizeY: number; sizeZ: number;
}

export function computeAabb(pos: Float32Array): Aabb {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];     if (pos[i] > maxX) maxX = pos[i];
    if (pos[i+1] < minY) minY = pos[i+1]; if (pos[i+1] > maxY) maxY = pos[i+1];
    if (pos[i+2] < minZ) minZ = pos[i+2]; if (pos[i+2] > maxZ) maxZ = pos[i+2];
  }
  return {
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, cz: (minZ + maxZ) / 2,
    minX, minY, minZ, maxX, maxY, maxZ,
    sizeX: maxX - minX, sizeY: maxY - minY, sizeZ: maxZ - minZ,
  };
}

// ── Shared vertex shader for all ShaderPass pipes ─────────────────────────────
export const UV_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

// ── LayeredMeshPipeBase ───────────────────────────────────────────────────────
/**
 * Base for pipes that replace the mesh's appearance by cloning it and hiding
 * the original.  Geometry is shared (so deform pipes still work), only
 * materials differ.  On dispose the clone is removed and the original is shown.
 */
export abstract class LayeredMeshPipeBase implements EffectPipe {
  abstract readonly name: string;

  private cloneRef: THREE.Mesh | THREE.Group | null = null;
  private originalRef: THREE.Mesh | THREE.Group | null = null;
  private sceneRef: THREE.Scene | null = null;

  setup(ctx: PipeSetupContext) { this.sceneRef = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, ctx: PipeSetupContext) {
    this.clearClone();
    this.originalRef = mesh;
    if (!mesh) return;

    const clone = this.shallowClone(mesh);
    this.applyToClone(clone, mesh, ctx);
    clone.visible = true;
    this.cloneRef = clone;
    ctx.scene.add(clone);

    // Sync initial transform
    this.syncTransform();

    // Hide original so only the clone renders
    mesh.visible = false;
  }

  update(ctx: PipeFrameContext) {
    this.syncTransform();
    this.tick(ctx);
  }

  /** Override to animate the clone each frame. */
  protected tick(_ctx: PipeFrameContext): void {}

  /**
   * Implement to apply materials / shaders to the freshly-cloned mesh.
   * `original` is the source mesh still in the scene (world transform valid).
   */
  protected abstract applyToClone(
    clone: THREE.Mesh | THREE.Group,
    original: THREE.Mesh | THREE.Group,
    ctx: PipeSetupContext,
  ): void;

  dispose() {
    if (this.originalRef) this.originalRef.visible = true;
    this.clearClone();
    this.originalRef = null;
    this.sceneRef = null;
  }

  private syncTransform() {
    if (!this.cloneRef || !this.originalRef) return;
    this.cloneRef.position.copy(this.originalRef.position);
    this.cloneRef.quaternion.copy(this.originalRef.quaternion);
    this.cloneRef.scale.copy(this.originalRef.scale);
  }

  private shallowClone(src: THREE.Object3D): THREE.Mesh | THREE.Group {
    if (src instanceof THREE.Mesh) {
      const m = new THREE.Mesh(src.geometry, src.material);
      m.castShadow = src.castShadow;
      m.receiveShadow = src.receiveShadow;
      return m;
    }
    const g = new THREE.Group();
    for (const child of src.children) {
      if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
        const c = this.shallowClone(child);
        c.position.copy(child.position);
        c.quaternion.copy(child.quaternion);
        c.scale.copy(child.scale);
        g.add(c);
      }
    }
    return g;
  }

  private clearClone() {
    if (this.cloneRef && this.sceneRef) {
      this.sceneRef.remove(this.cloneRef);
      this.cloneRef.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          mats.forEach((m: THREE.Material) => m?.dispose());
        }
      });
    }
    this.cloneRef = null;
  }
}

// ── DeformPipeBase ────────────────────────────────────────────────────────────
export abstract class DeformPipeBase implements EffectPipe {
  abstract readonly name: string;
  protected states: MeshDeformState[] = [];

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx?: PipeSetupContext) {
    this.states = collectDeformableMeshStates(mesh);
  }

  restoreGeometry() { restoreDeformStates(this.states); }

  syncOriginalFromCurrentGeometry() {
    for (const s of this.states) {
      const arr = s.geometry.attributes.position.array as Float32Array;
      s.originalPosition.set(arr);
    }
  }

  dispose() { this.states = []; }

  abstract update(ctx: PipeFrameContext): void;
}

// ── ShaderPipeBase ────────────────────────────────────────────────────────────
export abstract class ShaderPipeBase implements EffectPipe {
  abstract readonly name: string;
  protected pass: InstanceType<typeof ShaderPass> | null = null;

  constructor(protected readonly shaderDef: object) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, ctx: PipeSetupContext) {
    this.pass = new ShaderPass(this.shaderDef as any);
    this.initUniforms(ctx);
    composer.addPass(this.pass);
  }

  protected initUniforms(_ctx: PipeSetupContext) {}

  protected setU(name: string, val: any) {
    if (this.pass?.uniforms[name] !== undefined) this.pass.uniforms[name].value = val;
  }

  abstract update(ctx: PipeFrameContext): void;

  dispose() {
    this.pass?.dispose();
    this.pass = null;
  }
}
