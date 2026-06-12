import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface TessellatePipeParams {
  /** Number of subdivision iterations: 1 = 4×, 2 = 16×, 3 = 64× triangles */
  iterations?: number;
}

/**
 * Replaces each child mesh's geometry with a midpoint-subdivided copy.
 * Best placed BEFORE any vertex-deformation pipes in the stack so they
 * snapshot the denser geometry as their original.
 */
export class TessellatePipe implements EffectPipe {
  readonly name = 'tessellate';
  private savedGeometries = new Map<THREE.Mesh, THREE.BufferGeometry>();

  constructor(public params: TessellatePipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.restoreGeometry();
    if (!mesh) return;
    const iters = Math.max(1, Math.min(3, this.params.iterations ?? 1));
    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      this.savedGeometries.set(child, child.geometry);
      let geo: THREE.BufferGeometry = child.geometry;
      for (let i = 0; i < iters; i++) geo = subdivideOnce(geo);
      child.geometry = geo;
    });
  }

  restoreGeometry() {
    for (const [mesh, geo] of this.savedGeometries) {
      mesh.geometry = geo;
    }
    this.savedGeometries.clear();
  }

  update(_ctx: PipeFrameContext) {}

  dispose() {
    this.restoreGeometry();
  }
}

// ── Midpoint 4-1 subdivision ──────────────────────────────────────────────────
// Each triangle (A, B, C) → 4 triangles using edge midpoints mAB, mBC, mCA:
//   (A, mAB, mCA)  (mAB, B, mBC)  (mCA, mBC, C)  (mAB, mBC, mCA)

function subdivideOnce(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  // Work on a non-indexed copy so every triangle is independent
  const src = geo.index ? geo.toNonIndexed() : geo;

  const posAttr  = src.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = src.getAttribute('normal')   as THREE.BufferAttribute | undefined;
  const uvAttr   = src.getAttribute('uv')       as THREE.BufferAttribute | undefined;

  const triCount = posAttr.count / 3;       // number of original triangles
  const outVerts = triCount * 4 * 3;        // 4 new triangles × 3 verts each

  const outPos  = new Float32Array(outVerts * 3);
  const outNorm = normAttr ? new Float32Array(outVerts * 3) : null;
  const outUv   = uvAttr   ? new Float32Array(outVerts * 2) : null;

  let pi = 0, ni = 0, ui = 0;

  // Helpers to read a vertex
  const gp = (i: number) => ({ x: posAttr.getX(i),  y: posAttr.getY(i),  z: posAttr.getZ(i) });
  const gn = (i: number) => normAttr ? { x: normAttr.getX(i), y: normAttr.getY(i), z: normAttr.getZ(i) } : { x: 0, y: 1, z: 0 };
  const gu = (i: number) => uvAttr   ? { x: uvAttr.getX(i),   y: uvAttr.getY(i) }                        : { x: 0, y: 0 };

  type V3 = { x: number; y: number; z: number };
  type V2 = { x: number; y: number };
  const mid3 = (a: V3, b: V3): V3 => ({ x: (a.x+b.x)*0.5, y: (a.y+b.y)*0.5, z: (a.z+b.z)*0.5 });
  const mid2 = (a: V2, b: V2): V2 => ({ x: (a.x+b.x)*0.5, y: (a.y+b.y)*0.5 });

  const wp = (v: V3) => { outPos[pi++] = v.x; outPos[pi++] = v.y; outPos[pi++] = v.z; };
  const wn = (v: V3) => { if (outNorm) { outNorm[ni++] = v.x; outNorm[ni++] = v.y; outNorm[ni++] = v.z; } };
  const wu = (v: V2) => { if (outUv)   { outUv[ui++]   = v.x; outUv[ui++]   = v.y; } };
  const wv = (p: V3, n: V3, u: V2) => { wp(p); wn(n); wu(u); };

  for (let t = 0; t < triCount; t++) {
    const ia = t * 3, ib = ia + 1, ic = ia + 2;

    const pA = gp(ia), pB = gp(ib), pC = gp(ic);
    const nA = gn(ia), nB = gn(ib), nC = gn(ic);
    const uA = gu(ia), uB = gu(ib), uC = gu(ic);

    const pAB = mid3(pA, pB), pBC = mid3(pB, pC), pCA = mid3(pC, pA);
    const nAB = mid3(nA, nB), nBC = mid3(nB, nC), nCA = mid3(nC, nA);
    const uAB = mid2(uA, uB), uBC = mid2(uB, uC), uCA = mid2(uC, uA);

    wv(pA,  nA,  uA);  wv(pAB, nAB, uAB); wv(pCA, nCA, uCA); // corner A
    wv(pAB, nAB, uAB); wv(pB,  nB,  uB);  wv(pBC, nBC, uBC); // corner B
    wv(pCA, nCA, uCA); wv(pBC, nBC, uBC); wv(pC,  nC,  uC);  // corner C
    wv(pAB, nAB, uAB); wv(pBC, nBC, uBC); wv(pCA, nCA, uCA); // center
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  if (outNorm) result.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  if (outUv)   result.setAttribute('uv',     new THREE.BufferAttribute(outUv,  2));
  // Recompute smooth normals so deformations look correct
  result.computeVertexNormals();
  return result;
}
