import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Texture,
  Vector3,
} from "three";
import type { BufferGeometry } from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import robotoRegularFont from '@/assets/fonts/Roboto_Regular.typeface.json';
import interRegularFont from '@/assets/fonts/Inter_Regular.typeface.json';


/** Per-zone material overrides. Properties not specified inherit from the base material. */
export interface ZoneMaterialProps {
  color?: Color;
  metalness?: number;
  roughness?: number;
  /** Iridescence strength 0–1 (MeshPhysicalMaterial). */
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThicknessMin?: number;
  iridescenceThicknessMax?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
}

export interface TextGeometryOptions {
  text: string;
  fontFamily?: string;
  size?: number;
  height?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
  color?: Color;
  metalness?: number;
  roughness?: number;
  envMap?: Texture | null;
  envMapIntensity?: number;
  equalizeLineWidths?: boolean;
  equalizationMethod?: 'spacing' | 'fontSize';
  targetWidth?: number;
  lineSpacing?: number;
  /** Material override for the front letter-face cap (materialIndex 1). */
  faceZone?: ZoneMaterialProps;
  /** Material override for the bevel chamfer (reclassified to materialIndex 2). */
  bevelZone?: ZoneMaterialProps;
  /** Material override for the straight extrusion walls (materialIndex 0). */
  extrusionZone?: ZoneMaterialProps;
}

export interface FontDef {
  id: string;
  label: string;
  /** One or more fallback URLs for the typeface.json file. */
  urls: string[];
  /** If true, the font URL is user-supplied and may differ from `id`. */
  isCustom?: boolean;
}

export const DEFAULT_3D_FONT_FAMILY = 'droid_sans';
export const LATIN_EXT_SANS_3D_FONT_FAMILY = 'inter';

export const AVAILABLE_FONTS: FontDef[] = [
  {
    id: 'droid_sans',
    label: 'Droid Sans',
    urls: [
      'https://threejs.org/examples/fonts/droid/droid_sans_regular.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/droid/droid_sans_regular.typeface.json',
    ],
  },
  {
    id: 'inter',
    label: 'Inter (Latin-ext: PL, DE, ES)',
    urls: [],
  },
  {
    id: 'roboto',
    label: 'Roboto (Latin-ext: PL, DE, ES)',
    urls: [],
  },
  {
    id: 'helvetiker',
    label: 'Helvetiker (sans)',
    urls: [
      'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/helvetiker_regular.typeface.json',
    ],
  },
  {
    id: 'helvetiker_bold',
    label: 'Helvetiker Bold',
    urls: [
      'https://threejs.org/examples/fonts/helvetiker_bold.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/helvetiker_bold.typeface.json',
    ],
  },
  {
    id: 'optimer',
    label: 'Optimer (humanist)',
    urls: [
      'https://threejs.org/examples/fonts/optimer_regular.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/optimer_regular.typeface.json',
    ],
  },
  {
    id: 'optimer_bold',
    label: 'Optimer Bold',
    urls: [
      'https://threejs.org/examples/fonts/optimer_bold.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/optimer_bold.typeface.json',
    ],
  },
  {
    id: 'gentilis',
    label: 'Gentilis (serif)',
    urls: [
      'https://threejs.org/examples/fonts/gentilis_regular.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/gentilis_regular.typeface.json',
    ],
  },
  {
    id: 'gentilis_bold',
    label: 'Gentilis Bold',
    urls: [
      'https://threejs.org/examples/fonts/gentilis_bold.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/gentilis_bold.typeface.json',
    ],
  },
  {
    id: 'droid_sans_bold',
    label: 'Droid Sans Bold',
    urls: [
      'https://threejs.org/examples/fonts/droid/droid_sans_bold.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/droid/droid_sans_bold.typeface.json',
    ],
  },
  {
    id: 'droid_serif',
    label: 'Droid Serif',
    urls: [
      'https://threejs.org/examples/fonts/droid/droid_serif_regular.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/droid/droid_serif_regular.typeface.json',
    ],
  },
  {
    id: 'droid_serif_bold',
    label: 'Droid Serif Bold',
    urls: [
      'https://threejs.org/examples/fonts/droid/droid_serif_bold.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/droid/droid_serif_bold.typeface.json',
    ],
  },
];

/**
 * Register a custom typeface.json URL as a named font entry.
 * Returns the font id that can be passed to createTextGeometry.
 */
export function registerCustomFontUrl(label: string, url: string): string {
  const id = 'custom_' + url.replace(/[^a-z0-9]/gi, '_').slice(-40);
  const existing = AVAILABLE_FONTS.find(f => f.id === id);
  if (!existing) {
    AVAILABLE_FONTS.push({ id, label, urls: [url], isCustom: true });
  }
  return id;
}

const defaultOptions: Partial<TextGeometryOptions> = {
  size: 2,
  height: 0.8,
  curveSegments: 48,
  bevelEnabled: true,
  bevelThickness: 0.15,
  bevelSize: 0.08,
  bevelOffset: 0,
  bevelSegments: 5,
  metalness: 0.95,
  roughness: 0.15,
  envMapIntensity: 1.5,
  equalizeLineWidths: false,
  equalizationMethod: 'fontSize',
  targetWidth: 20,
  lineSpacing: 1.0,
};

/**
 * Splits ExtrudeGeometry's group 0 (walls + bevel) into two groups:
 *   0 = straight extrusion walls  (face normal nearly perpendicular to Z)
 *   2 = bevel chamfer faces       (face normal has a Z component)
 * Group 1 (caps) is unchanged.
 * Only applied when the caller requests separate bevel or extrusion zones.
 */
const BEVEL_NZ_THRESHOLD = 0.15;

function faceNormalZ(pos: ArrayLike<number>, i0: number, i1: number, i2: number): number {
  const ax = pos[i0*3], ay = pos[i0*3+1];
  const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
  const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];
  const az = pos[i0*3+2];
  const ex = bx-ax, ey = by-ay, ez = bz-az;
  const fx = cx-ax, fy = cy-ay, fz = cz-az;
  const nx = ey*fz - ez*fy, ny = ez*fx - ex*fz, nz = ex*fy - ey*fx;
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
  return len < 1e-10 ? 0 : nz / len;
}

function reclassifyBevelGroups(geo: BufferGeometry): void {
  if (!geo.index) return;
  const pos = geo.attributes.position.array;
  const src = geo.index.array;
  const IndexCtor = src instanceof Uint32Array ? Uint32Array : Uint16Array;

  const wallIdx: number[] = [];
  const capIdx: number[] = [];
  const bevelIdx: number[] = [];

  for (const g of geo.groups) {
    for (let i = g.start; i < g.start + g.count; i += 3) {
      const i0 = src[i], i1 = src[i+1], i2 = src[i+2];
      if (g.materialIndex === 1) {
        capIdx.push(i0, i1, i2);
      } else {
        if (Math.abs(faceNormalZ(pos, i0, i1, i2)) > BEVEL_NZ_THRESHOLD) {
          bevelIdx.push(i0, i1, i2);
        } else {
          wallIdx.push(i0, i1, i2);
        }
      }
    }
  }

  const newIdx = new IndexCtor(src.length);
  let ptr = 0;
  const wallStart = ptr; for (const v of wallIdx)  newIdx[ptr++] = v;
  const capStart  = ptr; for (const v of capIdx)   newIdx[ptr++] = v;
  const bevelStart = ptr; for (const v of bevelIdx) newIdx[ptr++] = v;

  geo.setIndex(new BufferAttribute(newIdx, 1));
  geo.clearGroups();
  if (wallIdx.length > 0)  geo.addGroup(wallStart,  wallIdx.length,  0);
  if (capIdx.length > 0)   geo.addGroup(capStart,   capIdx.length,   1);
  if (bevelIdx.length > 0) geo.addGroup(bevelStart, bevelIdx.length, 2);
}

function makeZoneMaterial(
  base: MeshStandardMaterial,
  zone: ZoneMaterialProps,
): MeshStandardMaterial | MeshPhysicalMaterial {
  const needsPhysical = zone.iridescence !== undefined || zone.clearcoat !== undefined;
  const opts: any = {
    color: zone.color ?? base.color.clone(),
    metalness: zone.metalness ?? base.metalness,
    roughness: zone.roughness ?? base.roughness,
    envMap: base.envMap,
    envMapIntensity: zone.envMapIntensity ?? base.envMapIntensity,
  };
  if (needsPhysical) {
    opts.iridescence = zone.iridescence ?? 0;
    opts.iridescenceIOR = zone.iridescenceIOR ?? 1.8;
    opts.iridescenceThicknessRange = [
      zone.iridescenceThicknessMin ?? 100,
      zone.iridescenceThicknessMax ?? 800,
    ];
    opts.clearcoat = zone.clearcoat ?? 0;
    opts.clearcoatRoughness = zone.clearcoatRoughness ?? 0.1;
    const mat = new MeshPhysicalMaterial(opts);
    patchBevelNormalReflect(mat as unknown as MeshStandardMaterial);
    return mat;
  }
  const mat = new MeshStandardMaterial(opts);
  patchBevelNormalReflect(mat);
  return mat;
}

/**
 * Clamps the fragment-shader normal to the camera-facing hemisphere.
 * Bevel normals interpolate past zero (pointing backward) at sharp edges;
 * simply reflecting z creates a near-forward normal that samples a bright
 * env-map region. Redirecting to a grazing tangent avoids the hot-pixel.
 * No fragments are discarded, so inner hole walls ("fences") stay visible.
 */
function patchBevelNormalReflect(mat: MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      if (normal.z < 0.0) normal = normalize(vec3(normal.xy, 1e-4));`,
    );
  };
  mat.customProgramCacheKey = () => 'text-bevel-normal-clamp';
}

const fontCache = new Map<string, Font>();

function parseBoldSegments(line: string): Array<{ text: string; bold: boolean }> {
  const segments: Array<{ text: string; bold: boolean }> = [];
  const regex = /<b>(.*?)<\/b>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) segments.push({ text: line.slice(lastIndex, match.index), bold: false });
    if (match[1]) segments.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) segments.push({ text: line.slice(lastIndex), bold: false });
  return segments.filter(s => s.text.length > 0);
}

function stripBoldTags(text: string): string {
  return text.replace(/<\/?b>/gi, '');
}

const BOLD_FONT_MAP: Record<string, string> = {
  droid_sans: 'droid_sans_bold',
  helvetiker: 'helvetiker_bold',
  optimer: 'optimer_bold',
  gentilis: 'gentilis_bold',
  droid_serif: 'droid_serif_bold',
};

function getBoldFontId(fontId: string): string {
  return BOLD_FONT_MAP[fontId] ?? fontId;
}

async function loadFont(fontId = DEFAULT_3D_FONT_FAMILY): Promise<Font> {
  if (fontCache.has(fontId)) return fontCache.get(fontId)!;

  const def = AVAILABLE_FONTS.find(f => f.id === fontId) ?? AVAILABLE_FONTS[0];

  if (def.id === 'roboto') {
    const font = new Font(robotoRegularFont as any);
    fontCache.set(def.id, font);
    if (fontId !== def.id) {
      fontCache.set(fontId, font);
    }
    return font;
  }

  if (def.id === 'inter') {
    const font = new Font(interRegularFont as any);
    fontCache.set(def.id, font);
    if (fontId !== def.id) {
      fontCache.set(fontId, font);
    }
    return font;
  }

  const urls = def.urls;

  return new Promise((resolve, reject) => {
    const tryLoad = async (index: number) => {
      if (index >= urls.length) {
        reject(new Error(`All URLs failed for font "${fontId}"`));
        return;
      }
      try {
        const response = await fetch(urls[index]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const font = new Font(data);
        fontCache.set(fontId, font);
        resolve(font);
      } catch (error) {
        console.error(`Font "${fontId}" failed from ${urls[index]}:`, error);
        tryLoad(index + 1);
      }
    };
    tryLoad(0);
  });
}

export interface CreateTextGeometryResult {
  geometry: TextGeometry | Group;
  /** Base material (extrusion walls, materialIndex 0). */
  material: MeshStandardMaterial;
  /** Face-cap material (letter face + back cap, materialIndex 1). Undefined when no faceZone. */
  faceMaterial?: MeshStandardMaterial | MeshPhysicalMaterial;
  /** Bevel material (chamfer, materialIndex 2). Undefined when no bevelZone. */
  bevelMaterial?: MeshStandardMaterial | MeshPhysicalMaterial;
}

export async function createTextGeometry(
  options: TextGeometryOptions,
): Promise<CreateTextGeometryResult> {
  const mergedOptions = { ...defaultOptions, ...Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)) };
  const { faceZone, bevelZone, extrusionZone } = options;
  // Always reclassify so each zone has its own materialIndex regardless of
  // whether the caller supplied explicit zone overrides.
  const needsReclassify = true;
  const rawLines = mergedOptions.text!.split('\n');
  const hasBold = rawLines.some(l => /<b>/i.test(l));
  // Strip tags for measurement; raw lines used for bold-aware rendering below
  const lines = rawLines.map(stripBoldTags);

  try {
    const fontIdToUse = mergedOptions.fontFamily ?? DEFAULT_3D_FONT_FAMILY;
    const boldFontId = getBoldFontId(fontIdToUse);
    const [font, boldFontOrNull] = await Promise.all([
      loadFont(fontIdToUse),
      hasBold && boldFontId !== fontIdToUse ? loadFont(boldFontId).catch(() => null) : Promise.resolve(null),
    ]);
    const boldFont = boldFontOrNull ?? font;

    // Calculate line widths and equalization factors
    const lineWidths: number[] = [];
    const equalizationFactors: number[] = lines.map(() => 1);

    // First pass: calculate natural widths (bold-aware so equalization factors are accurate)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (!line.trim()) { lineWidths.push(0); continue; }
      const rawLine = rawLines[lineIndex];
      if (/<b>/i.test(rawLine)) {
        // Measure each segment with its proper font so bold glyphs (wider) are accounted for
        const segments = parseBoldSegments(rawLine);
        let totalWidth = 0;
        for (const seg of segments) {
          const segFont = seg.bold ? boldFont : font;
          const geo = new TextGeometry(seg.text, {
            font: segFont as any,
            size: mergedOptions.size,
            depth: mergedOptions.height,
            curveSegments: mergedOptions.curveSegments,
            bevelEnabled: mergedOptions.bevelEnabled,
            bevelThickness: mergedOptions.bevelThickness,
            bevelSize: mergedOptions.bevelSize,
            bevelOffset: mergedOptions.bevelOffset,
            bevelSegments: mergedOptions.bevelSegments,
          } as any);
          geo.computeBoundingBox();
          totalWidth += (geo.boundingBox?.max.x ?? 0) - (geo.boundingBox?.min.x ?? 0);
          geo.dispose();
        }
        lineWidths.push(totalWidth);
      } else {
        const geometry = new TextGeometry(line, {
          font: font as any,
          size: mergedOptions.size,
          depth: mergedOptions.height,
          curveSegments: mergedOptions.curveSegments,
          bevelEnabled: mergedOptions.bevelEnabled,
          bevelThickness: mergedOptions.bevelThickness,
          bevelSize: mergedOptions.bevelSize,
          bevelOffset: mergedOptions.bevelOffset,
          bevelSegments: mergedOptions.bevelSegments,
        } as any);
        geometry.computeBoundingBox();
        const width = (geometry.boundingBox?.max.x ?? 0) - (geometry.boundingBox?.min.x ?? 0);
        lineWidths.push(width);
        geometry.dispose();
      }
    }

    // Calculate equalization factors
    if (mergedOptions.equalizeLineWidths!) {
      for (let i = 0; i < lineWidths.length; i++) {
        const width = lineWidths[i] || 1;
        equalizationFactors[i] = mergedOptions.targetWidth! / width;
      }
    }

    // Create the main group for all lines
    const mainGroup = new Group();
    const lineGeometries: { geometry: TextGeometry | Group; minY: number; maxY: number }[] = [];

    // Second pass: create geometries with equalization
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const factor = equalizationFactors[lineIndex];

      if (mergedOptions.equalizationMethod === 'fontSize' || !mergedOptions.equalizeLineWidths) {
        // Empty line → use a blank spacer (no visible geometry, but correct spacing)
        if (!line.trim()) {
          const spacerGroup = new Group();
          const emptySize = mergedOptions.size! * factor;
          lineGeometries.push({ geometry: spacerGroup, minY: 0, maxY: emptySize * 0.8 });
          continue;
        }

        // Bold-aware path: render per-segment when line contains <b> tags
        if (/<b>/i.test(rawLines[lineIndex])) {
          const segments = parseBoldSegments(rawLines[lineIndex]);
          const effectiveSize = mergedOptions.size! * factor;
          const geoParams = {
            size: effectiveSize,
            depth: mergedOptions.height,
            curveSegments: mergedOptions.curveSegments,
            bevelEnabled: mergedOptions.bevelEnabled,
            bevelThickness: mergedOptions.bevelThickness,
            bevelSize: mergedOptions.bevelSize! * factor,
            bevelOffset: mergedOptions.bevelOffset,
            bevelSegments: mergedOptions.bevelSegments,
          };
          const segInfos: Array<{ geo: TextGeometry; width: number; minY: number; maxY: number; startX: number }> = [];
          let totalWidth = 0;
          for (const seg of segments) {
            const segFont = seg.bold ? boldFont : font;
            const geo = new TextGeometry(seg.text, { font: segFont as any, ...geoParams } as any);
            geo.computeBoundingBox();
            const bbox = geo.boundingBox!;
            const width = bbox.max.x - bbox.min.x;
            segInfos.push({ geo, width, minY: bbox.min.y, maxY: bbox.max.y, startX: bbox.min.x });
            totalWidth += width;
          }
          let cursorX = -totalWidth / 2;
          let lineMinY = segInfos[0]?.minY ?? 0;
          let lineMaxY = segInfos[0]?.maxY ?? effectiveSize;
          const lineGroup = new Group();
          for (const { geo, width, minY, maxY, startX } of segInfos) {
            geo.translate(cursorX - startX, 0, 0);
            if (needsReclassify) reclassifyBevelGroups(geo);
            lineGroup.add(new Mesh(geo));
            cursorX += width;
            lineMinY = Math.min(lineMinY, minY);
            lineMaxY = Math.max(lineMaxY, maxY);
          }
          lineGeometries.push({ geometry: lineGroup, minY: lineMinY, maxY: lineMaxY });
          continue;
        }

        const lineGeometry = new TextGeometry(line, {
          font: font as any,
          size: mergedOptions.size! * factor,
          depth: mergedOptions.height,
          curveSegments: mergedOptions.curveSegments,
          bevelEnabled: mergedOptions.bevelEnabled,
          bevelThickness: mergedOptions.bevelThickness,
          bevelSize: mergedOptions.bevelSize! * factor,
          bevelOffset: mergedOptions.bevelOffset,
          bevelSegments: mergedOptions.bevelSegments,
        } as any);

        lineGeometry.computeBoundingBox();
        const minX = lineGeometry.boundingBox?.min.x ?? 0;
        const maxX = lineGeometry.boundingBox?.max.x ?? 0;
        const lineWidth = maxX - minX;
        // Center using the actual geometry extents so left/right edges align
        // precisely across all lines (bbox.min.x is non-zero for many glyphs)
        const centerX = (minX + maxX) / 2;
        const minY = lineGeometry.boundingBox?.min.y ?? 0;
        const maxY = lineGeometry.boundingBox?.max.y ?? mergedOptions.size!;
        lineGeometry.translate(-centerX, 0, 0);
        if (needsReclassify) reclassifyBevelGroups(lineGeometry);
        lineGeometries.push({ geometry: lineGeometry, minY, maxY });
      } else {
        // Empty line in spacing mode → spacer
        if (!line.trim()) {
          const spacerGroup = new Group();
          lineGeometries.push({ geometry: spacerGroup, minY: 0, maxY: mergedOptions.size! * 0.8 });
          continue;
        }
        // Spacing mode: create per-character geometries with extra gaps
        const naturalWidth = lineWidths[lineIndex];
        const extraSpace = (mergedOptions.targetWidth! - naturalWidth) / Math.max(1, line.length - 1);
        const lineGroup = new Group();
        let cursorX = 0;

        for (let charIndex = 0; charIndex < line.length; charIndex++) {
          const char = line[charIndex];
          if (char === ' ') {
            const spaceGeo = new TextGeometry(' ', {
              font: font as any,
              size: mergedOptions.size,
            } as any);
            spaceGeo.computeBoundingBox();
            cursorX += (spaceGeo.boundingBox!.max.x - spaceGeo.boundingBox!.min.x) + extraSpace;
            spaceGeo.dispose();
            continue;
          }

          const charGeometry = new TextGeometry(char, {
            font: font as any,
            size: mergedOptions.size,
            depth: mergedOptions.height,
            curveSegments: mergedOptions.curveSegments,
            bevelEnabled: mergedOptions.bevelEnabled,
            bevelThickness: mergedOptions.bevelThickness,
            bevelSize: mergedOptions.bevelSize,
            bevelOffset: mergedOptions.bevelOffset,
            bevelSegments: mergedOptions.bevelSegments,
          } as any);

          charGeometry.computeBoundingBox();
          const charWidth = charGeometry.boundingBox!.max.x - charGeometry.boundingBox!.min.x;
          charGeometry.translate(cursorX, 0, 0);
          if (needsReclassify) reclassifyBevelGroups(charGeometry);
          const charMesh = new Mesh(charGeometry);
          lineGroup.add(charMesh);
          cursorX += charWidth + extraSpace;
        }

        // Compute actual bbox of the assembled line
        const box = lineGroup.children.length > 0
          ? new Box3().setFromObject(lineGroup)
          : new Box3(new Vector3(0, 0, 0), new Vector3(0, mergedOptions.size!, 0));
        const centerX = (box.max.x + box.min.x) / 2;
        lineGroup.position.x = -centerX;
        lineGeometries.push({ geometry: lineGroup, minY: box.min.y, maxY: box.max.y });
      }
    }

    // Stack lines so the visual gap between bottom of line[i] and top of line[i+1] = lineSpacing
    const origins = new Array<number>(lineGeometries.length).fill(0);
    for (let i = 1; i < lineGeometries.length; i++) {
      origins[i] = origins[i - 1] + lineGeometries[i - 1].minY - mergedOptions.lineSpacing! - lineGeometries[i].maxY;
    }
    const totalTop = lineGeometries.length > 0 ? origins[0] + lineGeometries[0].maxY : 0;
    const totalBottom = lineGeometries.length > 0
      ? origins[lineGeometries.length - 1] + lineGeometries[lineGeometries.length - 1].minY
      : 0;
    const centerY = (totalTop + totalBottom) / 2;

    for (let i = 0; i < lineGeometries.length; i++) {
      const yOrigin = origins[i] - centerY;
      const { geometry: lineGeometry } = lineGeometries[i];
      if (lineGeometry instanceof Group) {
        lineGeometry.position.y = yOrigin;
        mainGroup.add(lineGeometry);
      } else {
        lineGeometry.translate(0, yOrigin, 0);
        const lineMesh = new Mesh(lineGeometry);
        mainGroup.add(lineMesh);
      }
    }

    const color =
      mergedOptions.color || new Color().setHSL(Math.random(), 0.8, 0.5);

    const materialOptions: any = {
      color,
      metalness: mergedOptions.envMap
        ? mergedOptions.metalness
        : Math.min(mergedOptions.metalness ?? 0, 0.25),
      roughness: mergedOptions.envMap
        ? mergedOptions.roughness
        : Math.max(mergedOptions.roughness ?? 0.45, 0.35),
    };
    if (mergedOptions.envMap) {
      materialOptions.envMap = mergedOptions.envMap;
      materialOptions.envMapIntensity = mergedOptions.envMapIntensity;
    }
    // Build a template material that captures base color/envMap settings.
    // Each zone then gets its own material via makeZoneMaterial so all three
    // can be tweaked independently at any time.
    const baseMaterial = new MeshStandardMaterial(materialOptions);

    // Extrusion walls (materialIndex 0) — shiny metallic by default.
    const material = makeZoneMaterial(baseMaterial, extrusionZone ?? {});

    // Face cap (materialIndex 1) — more porous/matte by default.
    const DEFAULT_FACE_ZONE: ZoneMaterialProps = { color: new Color(0x000000), metalness: 0.35, roughness: 1.0 };
    const faceMaterial = makeZoneMaterial(baseMaterial, faceZone ?? DEFAULT_FACE_ZONE);

    // Bevel chamfer (materialIndex 2) — inherits base by default.
    const bevelMaterial = makeZoneMaterial(baseMaterial, bevelZone ?? {});

    baseMaterial.dispose();
    // Shift so letter face is at z=0 and extrusion goes into screen (-Z)
    mainGroup.position.z = -(mergedOptions.height! + (mergedOptions.bevelEnabled ? (mergedOptions.bevelThickness ?? 0) : 0));
    return { geometry: mainGroup, material, faceMaterial, bevelMaterial };
  } catch (error) {
    console.error("Failed to load font, creating fallback geometry:", error);

    // Fallback: create simple extruded text using basic shapes
    const mainGroup = new Group();
    const baseLetterSpacing = mergedOptions.size! * 0.8;
    const lineSpacing = mergedOptions.size! + mergedOptions.lineSpacing!;

    // Calculate line widths for equalization
    const lineWidths: number[] = [];
    const equalizationFactors: number[] = lines.map(() => 1);

    // First pass: calculate natural widths
    for (const line of lines) {
      let width = 0;
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== ' ') {
          width += baseLetterSpacing;
        } else {
          width += baseLetterSpacing * 0.5;
        }
      }
      lineWidths.push(width);
    }

    // Calculate equalization factors
    if (mergedOptions.equalizeLineWidths!) {
      const targetWidth = mergedOptions.targetWidth!;

      for (let i = 0; i < lineWidths.length; i++) {
        const width = lineWidths[i] || 1;
        const factor = targetWidth / width;
        equalizationFactors[i] = factor;
      }
    }

    // Second pass: create geometries
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const factor = equalizationFactors[lineIndex];
      const lineGroup = new Group();

      let currentX = 0;
      const letterSpacing = mergedOptions.equalizationMethod === 'spacing'
        ? baseLetterSpacing * factor
        : baseLetterSpacing;

      const charSize = mergedOptions.equalizationMethod === 'fontSize'
        ? mergedOptions.size! * factor
        : mergedOptions.size!;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === " ") {
          currentX += letterSpacing * 0.5;
          continue;
        }

        // Create a simple box for each character
        const charGeometry = new BoxGeometry(
          charSize * 0.6,
          charSize,
          mergedOptions.height!,
        );

        const charMesh = new Mesh(charGeometry);
        charMesh.position.x = currentX;
        lineGroup.add(charMesh);

        currentX += letterSpacing;
      }

      // Center the line horizontally
      const box = new Box3().setFromObject(lineGroup);
      const center = box.getCenter(new Vector3());
      lineGroup.position.x = -center.x;

      // Position vertically
      const yOffset = (lines.length - 1) * lineSpacing / 2 - lineIndex * lineSpacing;
      lineGroup.position.y = yOffset;

      mainGroup.add(lineGroup);
    }

    const color =
      mergedOptions.color || new Color().setHSL(Math.random(), 0.8, 0.5);

    const materialOptions: any = {
      color,
      metalness: mergedOptions.envMap
        ? mergedOptions.metalness
        : Math.min(mergedOptions.metalness ?? 0, 0.25),
      roughness: mergedOptions.envMap
        ? mergedOptions.roughness
        : Math.max(mergedOptions.roughness ?? 0.45, 0.35),
    };
    if (mergedOptions.envMap) {
      materialOptions.envMap = mergedOptions.envMap;
      materialOptions.envMapIntensity = mergedOptions.envMapIntensity;
    }
    const material = new MeshStandardMaterial(materialOptions);
    patchBevelNormalReflect(material);
    // BoxGeometry is z-centered; shift front face to z=0 so extrusion goes into screen
    mainGroup.position.z = -(mergedOptions.height! / 2);
    return { geometry: mainGroup, material };  // fallback: no zone materials
  }
}

export function createTextMesh(
  geometry: TextGeometry,
  material: MeshStandardMaterial,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
