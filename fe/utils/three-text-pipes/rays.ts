import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface RaysPipeParams {
  mode?: 'radial' | 'spaghetti' | 'chip' | 'heart';
  count?: number;
  innerThickness?: number;
  outerThickness?: number;
  lockThickness?: boolean;
  innerMargin?: number;
  outerMargin?: number;
  heartRotation?: number; // degrees 0-180
}

// Trapezoid prism geometry: x from 0 (near/inner end) to len (far/outer end),
// y-width tapers from thickNear to thickFar, z-depth constant.
function createTaperedRayGeo(
  len: number,
  thickNear: number,
  thickFar: number,
  depth = 0.4,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const hn = thickNear / 2, hf = thickFar / 2, hd = depth / 2;
  // 8 vertices: indices 0-3 = back face, 4-7 = front face
  // back (z=-hd): near-bottom=0, near-top=1, far-top=2, far-bottom=3
  // front (z=+hd): near-bottom=4, near-top=5, far-top=6, far-bottom=7
  const pos = new Float32Array([
    0,    -hn,  -hd,   0,    hn,  -hd,   len,  hf,  -hd,   len, -hf,  -hd,
    0,    -hn,   hd,   0,    hn,   hd,   len,  hf,   hd,   len, -hf,   hd,
  ]);
  const idx = new Uint16Array([
    0, 1, 2,  0, 2, 3,      // back  (CCW from -z)
    4, 6, 5,  4, 7, 6,      // front (CCW from +z)
    1, 5, 6,  1, 6, 2,      // top
    0, 3, 7,  0, 7, 4,      // bottom
    0, 4, 5,  0, 5, 1,      // near cap
    3, 2, 6,  3, 6, 7,      // far cap
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

// ── Heart curve helpers ────────────────────────────────────────────────────────

function heartPoint(t: number): [number, number] {
  const s = Math.sin(t);
  return [
    16 * s * s * s,
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
  ];
}

interface HeartRay { pos: [number, number]; normal: [number, number] }

// Returns rayCount positions+normals evenly spaced along the heart arc,
// scaled so the heart just encloses a circle of the given radius.
function heartRayPositions(rayCount: number, radius: number): HeartRay[] {
  const N_SAMPLE = 2000;
  const pts: Array<[number, number]> = [];
  const arcLen: number[] = [0];

  for (let i = 0; i < N_SAMPLE; i++) {
    const t = (i / N_SAMPLE) * Math.PI * 2;
    pts.push(heartPoint(t));
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      arcLen.push(arcLen[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
  }
  const totalArc = arcLen[N_SAMPLE - 1];

  // Bounding box of raw heart for scaling
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rawR = Math.max(maxX - minX, maxY - minY) / 2;
  const scale = radius / rawR;

  const result: HeartRay[] = [];

  for (let i = 0; i < rayCount; i++) {
    const target = (i / rayCount) * totalArc;
    // Binary search for the arc-length parameter
    let lo = 0, hi = N_SAMPLE - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (arcLen[mid] < target) lo = mid; else hi = mid;
    }
    const frac = arcLen[hi] > arcLen[lo]
      ? (target - arcLen[lo]) / (arcLen[hi] - arcLen[lo])
      : 0;
    const tLo = (lo / N_SAMPLE) * Math.PI * 2;
    const tHi = (hi / N_SAMPLE) * Math.PI * 2;
    const t = tLo + frac * (tHi - tLo);

    const [px, py] = heartPoint(t);
    // Outward normal via finite-difference tangent
    const eps = 0.001;
    const [px2, py2] = heartPoint(t + eps);
    const tanX = px2 - px, tanY = py2 - py;
    const tanLen = Math.sqrt(tanX * tanX + tanY * tanY) || 1;
    // Two candidate normals (perpendiculars to tangent)
    const n0x = -tanY / tanLen, n0y = tanX / tanLen;
    // Choose the one pointing away from the heart centroid
    const toCx = px - cx, toCy = py - cy;
    const sign = (n0x * toCx + n0y * toCy) >= 0 ? 1 : -1;
    const nx = n0x * sign, ny = n0y * sign;

    result.push({
      pos: [(px - cx) * scale, (py - cy) * scale],
      normal: [nx, ny],
    });
  }

  return result;
}

// ── Pipe ─────────────────────────────────────────────────────────────────────

export class RaysPipe implements EffectPipe {
  readonly name = 'rays';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: RaysPipeParams = {}) {}
  setup(ctx: PipeSetupContext) { this.scene = ctx.scene; }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    if (!this.scene) return;
    if (this.group) { this.scene.remove(this.group); this.group = null; }
    if (!mesh) return;

    const {
      mode = 'radial',
      count: rayCount = 24,
      innerThickness = 0.06,
      outerThickness = 0.08,
      innerMargin = 2,
      outerMargin = 6,
      heartRotation = 0,
    } = this.params;

    const depth = 0.4;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const mainGroup = new THREE.Group();
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const halfDiag = Math.sqrt(size.x * size.x + size.y * size.y) / 2;
    const innerR = halfDiag + innerMargin;

    if (mode === 'radial') {
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const geo = createTaperedRayGeo(outerMargin, innerThickness, outerThickness, depth);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(
          center.x + Math.cos(angle) * innerR,
          center.y + Math.sin(angle) * innerR,
          center.z,
        );
        m.rotation.z = angle;
        mainGroup.add(m);
      }

    } else if (mode === 'spaghetti') {
      const avgThick = (innerThickness + outerThickness) / 2;
      const seed = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5;
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2 + (seed(i) - 0.5) * 0.4;
        const rayLen = outerMargin * (0.5 + seed(i + 50));
        const curvePts: THREE.Vector3[] = [];
        for (let s = 0; s <= 8; s++) {
          const t = s / 8;
          const r = innerR + rayLen * t;
          const a = angle + Math.sin(t * Math.PI * 2 + seed(i * 3) * 10) * 0.3 * (1 - t * 0.5);
          curvePts.push(new THREE.Vector3(
            center.x + Math.cos(a) * r,
            center.y + Math.sin(a) * r,
            center.z,
          ));
        }
        const geo = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(curvePts), 16, avgThick / 2, 4, false,
        );
        mainGroup.add(new THREE.Mesh(geo, mat));
      }

    } else if (mode === 'chip') {
      const halfW = size.x / 2 + innerMargin;
      const halfH = size.y / 2 + innerMargin;
      const perSide = Math.ceil(rayCount / 4);
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < perSide; i++) {
          const t = (i + 0.5) / perSide;
          let px = 0, py = 0, nx = 0, ny = 0;
          if (side === 0)      { px = center.x + (t - 0.5) * size.x; py = center.y + halfH; nx = 0; ny = 1; }
          else if (side === 1) { px = center.x + halfW; py = center.y + (t - 0.5) * size.y; nx = 1; ny = 0; }
          else if (side === 2) { px = center.x + (t - 0.5) * size.x; py = center.y - halfH; nx = 0; ny = -1; }
          else                 { px = center.x - halfW; py = center.y + (t - 0.5) * size.y; nx = -1; ny = 0; }
          const geo = createTaperedRayGeo(outerMargin, innerThickness, outerThickness, depth);
          const m = new THREE.Mesh(geo, mat);
          m.position.set(px, py, center.z);
          m.rotation.z = Math.atan2(ny, nx);
          mainGroup.add(m);
        }
      }

    } else { // heart
      // Position rays relative to group origin so rotation works around the text center
      mainGroup.position.set(center.x, center.y, center.z);
      const rays = heartRayPositions(rayCount, innerR);
      for (const { pos: [px, py], normal: [nx, ny] } of rays) {
        const geo = createTaperedRayGeo(outerMargin, innerThickness, outerThickness, depth);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, 0);
        m.rotation.z = Math.atan2(ny, nx);
        mainGroup.add(m);
      }
      mainGroup.rotation.z = heartRotation * Math.PI / 180;
    }

    this.group = mainGroup;
    this.scene.add(this.group);
  }

  update(_ctx: PipeFrameContext) {}

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null;
  }
}
