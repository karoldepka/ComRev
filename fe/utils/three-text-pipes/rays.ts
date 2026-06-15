import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export const DEFAULT_STAR_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmNjYwMCI+PHBhdGggZD0iTTEyIDE3LjI3TDE4LjE4IDIxbC0xLjY0LTcuMDNMMjIgOS4yNGwtNy4xOS0uNjFMMTIgMkw5LjE5IDguNjNMMiA5LjI0bDUuNDYgNC43M0w1LjgyIDIxTDEyIDE3LjI3eiIvPjwvc3ZnPg==';
export const DEFAULT_HEART_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2U1NSI+PHBhdGggZD0iTTEyIDIxLjM1bC0xLjQ1LTEuMzJDNS40IDE1LjM2IDIgMTIuMjggMiA4LjUgMiA1LjQyIDQuNDIgMyA3LjUgM2MxLjc0IDAgMy40MS44MSA0LjUgMi4wOUMxMy4wOSAzLjgxIDE0Ljc2IDMgMTYuNSAzIDE5LjU4IDMgMjIgNS40MiAyMiA4LjVjMCAzLjc4LTMuNCA2Ljg2LTguNTUgMTEuNTRMMTIgMjEuMzV6Ii8+PC9zdmc+';
export const DEFAULT_LIGHTNING_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmY2MwMCI+PHBhdGggZD0iTTExIDIxaC0xbDEtN0g3LjVjLS41OCAwLS41Ny0uMzItLjM4LS42Ni4xOS0uMzQgMTItMjAuMzQgMTItMjAuMzRoMWwtMSA3aDMuNWMuNSAwIC41LjMuMS43TDExIDIxeiIvPjwvc3ZnPg==';

export interface RaysPipeParams {
  mode?: 'radial' | 'spaghetti' | 'chip' | 'wings' | 'heart';
  rayShape?: 'bar' | 'spaghetti' | 'image' | 'crystal' | 'thunder' | 'sine' | 'petal';
  layout?: 'radial' | 'chip' | 'wings' | 'heart' | 'cross' | 'sunburst' | 'halo' | 'spiral' | 'rose';
  count?: number;
  innerThickness?: number;
  outerThickness?: number;
  lockThickness?: boolean;
  innerMargin?: number;
  outerMargin?: number;
  heartRotation?: number; // degrees 0-180
  rayImage?: string;
  imageScale?: number;
  crystalWidth?: number;
  thunderZigzags?: number;
  sineCycles?: number;
  spiralTightness?: number;
  roseK?: number;
  wingsStyle?: 'straight' | 'angel' | 'falcon' | 'bat';
  leftEnabled?: boolean;
  rightEnabled?: boolean;
  topEnabled?: boolean;
  bottomEnabled?: boolean;
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

function createCrystalRayGeo(
  len: number,
  thickStart: number,
  thickMiddle: number,
  thickEnd: number,
  depth = 0.4,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const midX = len * 0.35;
  const hs = thickStart / 2;
  const hm = thickMiddle / 2;
  const he = thickEnd / 2;
  const hd = depth / 2;

  // 12 vertices: 0-3 = start cap, 4-7 = middle ring, 8-11 = end cap
  const pos = new Float32Array([
    // start cap (x=0)
    0,    -hs, -hd,
    0,     hs, -hd,
    0,     hs,  hd,
    0,    -hs,  hd,
    // middle ring (x=midX)
    midX, -hm, -hd,
    midX,  hm, -hd,
    midX,  hm,  hd,
    midX, -hm,  hd,
    // end cap (x=len)
    len,  -he, -hd,
    len,   he, -hd,
    len,   he,  hd,
    len,  -he,  hd,
  ]);

  const idx = new Uint16Array([
    // start cap
    0, 2, 1,  0, 3, 2,
    // left segment (x=0 to x=midX)
    0, 4, 7,  0, 7, 3, // bottom
    1, 6, 5,  1, 2, 6, // top
    3, 7, 6,  3, 6, 2, // front
    0, 1, 5,  0, 5, 4, // back
    // right segment (x=midX to x=len)
    7, 11, 8, 7, 8, 4, // bottom
    5, 6, 10, 5, 10, 9, // top
    6, 7, 11, 6, 11, 10, // front
    4, 5, 9,  4, 9, 8, // back
    // end cap
    8, 9, 10, 8, 10, 11,
  ]);

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

function createThunderRayGeo(len: number, thickness: number, zigzags = 3): THREE.BufferGeometry {
  const curvePts: THREE.Vector3[] = [];
  const segments = zigzags * 2;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = len * t;
    const y = i === 0 || i === segments ? 0 : (i % 2 === 1 ? 0.35 : -0.35) * len * 0.15;
    curvePts.push(new THREE.Vector3(x, y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.0);
  return new THREE.TubeGeometry(curve, segments * 4, thickness / 2, 5, false);
}

function createSineRayGeo(len: number, thickness: number, cycles = 2): THREE.BufferGeometry {
  const curvePts: THREE.Vector3[] = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = len * t;
    const y = Math.sin(t * Math.PI * 2 * cycles) * len * 0.08;
    curvePts.push(new THREE.Vector3(x, y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(curvePts);
  return new THREE.TubeGeometry(curve, segments, thickness / 2, 6, false);
}

function createPetalRayGeo(len: number, thickness: number, depth = 0.2): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(len * 0.5, thickness, len, 0);
  shape.quadraticCurveTo(len * 0.5, -thickness, 0, 0);
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: thickness * 0.08,
    bevelThickness: depth * 0.2,
  });
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
      rayShape: rawRayShape,
      layout: rawLayout,
      count: rayCount = 24,
      innerThickness = 0.06,
      outerThickness = 0.08,
      innerMargin = 2,
      outerMargin = 6,
      heartRotation = 0,
      rayImage = DEFAULT_STAR_SVG,
      imageScale = 1.0,
      crystalWidth = 0.12,
      thunderZigzags = 3,
      sineCycles = 2,
      spiralTightness = 1.0,
      roseK = 4,
      wingsStyle = 'straight',
      leftEnabled = true,
      rightEnabled = true,
      topEnabled = true,
      bottomEnabled = true,
    } = this.params;

    // Resolve shape and layout (with backward compatibility)
    let rayShape: 'bar' | 'spaghetti' | 'image' | 'crystal' | 'thunder' | 'sine' | 'petal' = rawRayShape ?? 'bar';
    let layout: 'radial' | 'chip' | 'wings' | 'heart' | 'cross' | 'sunburst' | 'halo' | 'spiral' | 'rose' = rawLayout ?? 'radial';

    if (rawRayShape === undefined && rawLayout === undefined) {
      if (mode === 'spaghetti') {
        rayShape = 'spaghetti';
        layout = 'radial';
      } else {
        rayShape = 'bar';
        layout = mode as any;
      }
    }

    const depth = 0.4;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const mainGroup = new THREE.Group();
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const halfDiag = Math.sqrt(size.x * size.x + size.y * size.y) / 2;
    const innerR = halfDiag + innerMargin;

    // Generate instances
    let instances: Array<{
      pos: THREE.Vector3;
      angle: number;
      length: number;
      thickness: number;
      index: number;
    }> = [];

    const seed = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5;

    if (layout === 'radial') {
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        instances.push({
          pos: new THREE.Vector3(
            center.x + Math.cos(angle) * innerR,
            center.y + Math.sin(angle) * innerR,
            center.z,
          ),
          angle,
          length: outerMargin,
          thickness: (innerThickness + outerThickness) / 2,
          index: i,
        });
      }
    } else if (layout === 'chip') {
      const halfW = size.x / 2 + innerMargin;
      const halfH = size.y / 2 + innerMargin;
      const perSide = Math.ceil(rayCount / 4);
      let globalIdx = 0;
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < perSide; i++) {
          const t = (i + 0.5) / perSide;
          let px = 0, py = 0, nx = 0, ny = 0;
          if (side === 0)      { px = center.x + (t - 0.5) * size.x; py = center.y + halfH; nx = 0; ny = 1; }
          else if (side === 1) { px = center.x + halfW; py = center.y + (t - 0.5) * size.y; nx = 1; ny = 0; }
          else if (side === 2) { px = center.x + (t - 0.5) * size.x; py = center.y - halfH; nx = 0; ny = -1; }
          else                 { px = center.x - halfW; py = center.y + (t - 0.5) * size.y; nx = -1; ny = 0; }
          instances.push({
            pos: new THREE.Vector3(px, py, center.z),
            angle: Math.atan2(ny, nx),
            length: outerMargin,
            thickness: (innerThickness + outerThickness) / 2,
            index: globalIdx++,
          });
        }
      }
    } else if (layout === 'wings') {
      const halfW = size.x / 2 + innerMargin;
      const halfH = size.y / 2;
      const rowsPerSide = Math.max(1, Math.ceil(rayCount / 2));
      const ySpan = Math.max(size.y, innerMargin * 2, 1);
      let globalIdx = 0;
      for (let i = 0; i < rowsPerSide; i++) {
        const t = rowsPerSide === 1 ? 0 : i / (rowsPerSide - 1);
        const y = center.y + halfH - t * ySpan;

        let lengthFactor = 1 - t * 0.72;
        let leftAngle = Math.PI;
        let rightAngle = 0;

        if (wingsStyle === 'angel') {
          const angleOffset = (0.28 - t * 0.75) * Math.PI / 2;
          rightAngle = angleOffset;
          leftAngle = Math.PI - angleOffset;
          lengthFactor = Math.sin((1 - t * 0.8) * Math.PI / 2) * 0.8 + 0.2;
        } else if (wingsStyle === 'falcon') {
          const angleOffset = (-0.15 - t * 0.35) * Math.PI / 2;
          rightAngle = angleOffset;
          leftAngle = Math.PI - angleOffset;
          lengthFactor = Math.pow(1 - t, 1.4) * 0.85 + 0.15;
        } else if (wingsStyle === 'bat') {
          const angleOffset = (-0.25 + Math.sin(t * Math.PI) * 0.3) * Math.PI / 2;
          rightAngle = angleOffset;
          leftAngle = Math.PI - angleOffset;
          lengthFactor = (0.65 + 0.35 * Math.cos(t * Math.PI * 4)) * (1 - t * 0.5);
        }

        const rayLen = outerMargin * Math.max(0.15, lengthFactor);
        const thickness = THREE.MathUtils.lerp(
          outerThickness,
          innerThickness,
          Math.min(1, t * 1.15),
        );
        const rowInset = innerMargin * (0.12 + t * 0.18);
        const sideSpecs = [
          { x: center.x + halfW + rowInset, angle: rightAngle },
          { x: center.x - halfW - rowInset, angle: leftAngle },
        ];
        for (const side of sideSpecs) {
          instances.push({
            pos: new THREE.Vector3(side.x, y, center.z),
            angle: side.angle,
            length: rayLen,
            thickness: thickness,
            index: globalIdx++,
          });
        }
      }
    } else if (layout === 'heart') {
      const rays = heartRayPositions(rayCount, innerR);
      const rot = (heartRotation * Math.PI) / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      let globalIdx = 0;
      for (const { pos: [px, py], normal: [nx, ny] } of rays) {
        const rx = px * cos - py * sin;
        const ry = px * sin + py * cos;
        const angle = Math.atan2(ny, nx) + rot;
        instances.push({
          pos: new THREE.Vector3(center.x + rx, center.y + ry, center.z),
          angle,
          length: outerMargin,
          thickness: (innerThickness + outerThickness) / 2,
          index: globalIdx++,
        });
      }
    } else if (layout === 'cross') {
      let globalIdx = 0;
      for (let i = 0; i < rayCount; i++) {
        const dirIdx = i % 4;
        const step = Math.floor(i / 4);
        const angle = (dirIdx * Math.PI) / 2;
        const dist = innerR + step * (outerMargin * 0.25);
        instances.push({
          pos: new THREE.Vector3(
            center.x + Math.cos(angle) * dist,
            center.y + Math.sin(angle) * dist,
            center.z,
          ),
          angle,
          length: outerMargin * 0.8,
          thickness: (innerThickness + outerThickness) / 2,
          index: globalIdx++,
        });
      }
    } else if (layout === 'sunburst') {
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const isEven = i % 2 === 0;
        const rayLen = outerMargin * (isEven ? 1.0 : 0.5);
        instances.push({
          pos: new THREE.Vector3(
            center.x + Math.cos(angle) * innerR,
            center.y + Math.sin(angle) * innerR,
            center.z,
          ),
          angle,
          length: rayLen,
          thickness: isEven ? outerThickness : innerThickness,
          index: i,
        });
      }
    } else if (layout === 'halo') {
      const rings = 2;
      const countPerRing = Math.max(2, Math.floor(rayCount / rings));
      let globalIdx = 0;
      for (let ring = 0; ring < rings; ring++) {
        const ringR = innerR + ring * (outerMargin * 0.4);
        const offsetAngle = ring === 1 ? Math.PI / countPerRing : 0;
        for (let i = 0; i < countPerRing; i++) {
          const angle = (i / countPerRing) * Math.PI * 2 + offsetAngle;
          instances.push({
            pos: new THREE.Vector3(
              center.x + Math.cos(angle) * ringR,
              center.y + Math.sin(angle) * ringR,
              center.z,
            ),
            angle,
            length: outerMargin * 0.5,
            thickness: (innerThickness + outerThickness) / 2,
            index: globalIdx++,
          });
        }
      }
    } else if (layout === 'spiral') {
      const goldenAngle = 137.5 * (Math.PI / 180);
      for (let i = 0; i < rayCount; i++) {
        const angle = i * goldenAngle * spiralTightness;
        const dist = innerR + (i / rayCount) * outerMargin;
        instances.push({
          pos: new THREE.Vector3(
            center.x + Math.cos(angle) * dist,
            center.y + Math.sin(angle) * dist,
            center.z,
          ),
          angle,
          length: outerMargin * 0.6,
          thickness: (innerThickness + outerThickness) / 2,
          index: i,
        });
      }
    } else if (layout === 'rose') {
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const roseFactor = Math.abs(Math.cos(roseK * angle));
        const dist = innerR + roseFactor * outerMargin;
        instances.push({
          pos: new THREE.Vector3(
            center.x + Math.cos(angle) * dist,
            center.y + Math.sin(angle) * dist,
            center.z,
          ),
          angle,
          length: outerMargin * 0.5,
          thickness: (innerThickness + outerThickness) / 2,
          index: i,
        });
      }
    }

    // Filter instances based on enabled directions
    instances = instances.filter((inst) => {
      const rx = (inst.pos.x - center.x) / (size.x / 2 + innerMargin);
      const ry = (inst.pos.y - center.y) / (size.y / 2 + innerMargin);
      
      let side: 'left' | 'right' | 'top' | 'bottom' = 'right';
      if (Math.abs(rx) > Math.abs(ry)) {
        side = rx > 0 ? 'right' : 'left';
      } else {
        side = ry > 0 ? 'top' : 'bottom';
      }
      
      if (side === 'left') return leftEnabled;
      if (side === 'right') return rightEnabled;
      if (side === 'top') return topEnabled;
      if (side === 'bottom') return bottomEnabled;
      return true;
    });

    // Now render based on rayShape
    if (rayShape === 'bar') {
      for (const inst of instances) {
        const thickNear = layout === 'wings' ? inst.thickness : innerThickness;
        const thickFar = layout === 'wings' ? inst.thickness * 0.72 : outerThickness;
        const geo = createTaperedRayGeo(inst.length, thickNear, thickFar, depth);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(inst.pos);
        m.rotation.z = inst.angle;
        mainGroup.add(m);
      }
    } else if (rayShape === 'spaghetti') {
      const avgThick = (innerThickness + outerThickness) / 2;
      for (const inst of instances) {
        const length = inst.length * (0.5 + seed(inst.index + 50));
        const angle = inst.angle + (seed(inst.index) - 0.5) * 0.4;
        const curvePts: THREE.Vector3[] = [];
        const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
        const perp = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
        const seedVal = seed(inst.index * 3);

        for (let s = 0; s <= 8; s++) {
          const t = s / 8;
          const dist = length * t;
          const wave = Math.sin(t * Math.PI * 2 + seedVal * 10) * 0.3 * (1 - t * 0.5) * length;
          const p = inst.pos.clone()
            .addScaledVector(dir, dist)
            .addScaledVector(perp, wave);
          curvePts.push(p);
        }
        const geo = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(curvePts), 16, avgThick / 2, 4, false,
        );
        mainGroup.add(new THREE.Mesh(geo, mat));
      }
    } else if (rayShape === 'image') {
      const textureLoader = new THREE.TextureLoader();
      const texture = textureLoader.load(rayImage, () => {
        // Trigger update since texture loaded async
        texture.needsUpdate = true;
      });
      texture.colorSpace = THREE.SRGBColorSpace;

      const imgMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      for (const inst of instances) {
        const w = inst.length * 0.5 * imageScale;
        const h = w;
        const geo = new THREE.PlaneGeometry(w, h);
        geo.translate(w / 2, 0, 0); // pivot at left/inner end
        const m = new THREE.Mesh(geo, imgMat);
        m.position.copy(inst.pos);
        m.rotation.z = inst.angle;
        mainGroup.add(m);
      }
    } else if (rayShape === 'crystal') {
      for (const inst of instances) {
        const thickNear = innerThickness;
        const thickFar = outerThickness;
        const geo = createCrystalRayGeo(inst.length, thickNear, crystalWidth, thickFar, depth);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(inst.pos);
        m.rotation.z = inst.angle;
        mainGroup.add(m);
      }
    } else if (rayShape === 'thunder') {
      const avgThick = (innerThickness + outerThickness) / 2;
      for (const inst of instances) {
        const geo = createThunderRayGeo(inst.length, avgThick, thunderZigzags);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(inst.pos);
        m.rotation.z = inst.angle;
        mainGroup.add(m);
      }
    } else if (rayShape === 'sine') {
      const avgThick = (innerThickness + outerThickness) / 2;
      for (const inst of instances) {
        const geo = createSineRayGeo(inst.length, avgThick, sineCycles);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(inst.pos);
        m.rotation.z = inst.angle;
        mainGroup.add(m);
      }
    } else if (rayShape === 'petal') {
      const avgThick = (innerThickness + outerThickness) / 2;
      for (const inst of instances) {
        const geo = createPetalRayGeo(inst.length, avgThick, depth);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(inst.pos);
        m.rotation.z = inst.angle;
        mainGroup.add(m);
      }
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

