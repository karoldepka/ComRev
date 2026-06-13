import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import robotoRegularFont from '@/assets/fonts/Roboto_Regular.typeface.json';
import interRegularFont from '@/assets/fonts/Inter_Regular.typeface.json';


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
  color?: THREE.Color;
  metalness?: number;
  roughness?: number;
  envMap?: THREE.Texture | null;
  envMapIntensity?: number;
  equalizeLineWidths?: boolean;
  equalizationMethod?: 'spacing' | 'fontSize';
  targetWidth?: number;
  lineSpacing?: number;
}

export interface FontDef {
  id: string;
  label: string;
  /** One or more fallback URLs for the typeface.json file. */
  urls: string[];
  /** If true, the font URL is user-supplied and may differ from `id`. */
  isCustom?: boolean;
}

export const AVAILABLE_FONTS: FontDef[] = [
  {
    id: 'roboto',
    label: 'Roboto (Latin-ext: PL, ES, CA, PT, DE)',
    urls: [],
  },
  {
    id: 'inter',
    label: 'Inter (Latin-ext: PL, ES, CA, PT, DE)',
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
    id: 'droid_sans',
    label: 'Droid Sans',
    urls: [
      'https://threejs.org/examples/fonts/droid/droid_sans_regular.typeface.json',
      'https://unpkg.com/three@latest/examples/fonts/droid/droid_sans_regular.typeface.json',
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
 * Reflects the fragment-shader normal's z component when it points away from
 * the camera. This cures the bevel shading artifact (smooth-shaded bevel
 * normals that interpolate to face backward) without discarding any fragments —
 * so geometrically front-facing side walls remain visible at oblique angles.
 */
function patchBevelNormalReflect(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      if (normal.z < 0.0) normal.z = -normal.z;`,
    );
  };
  mat.customProgramCacheKey = () => 'text-bevel-normal-reflect';
}

const fontCache = new Map<string, Font>();

async function loadFont(fontId = 'helvetiker'): Promise<Font> {
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

export async function createTextGeometry(
  options: TextGeometryOptions,
): Promise<{
  geometry: TextGeometry | THREE.Group;
  material: THREE.MeshStandardMaterial;
}> {
  const mergedOptions = { ...defaultOptions, ...Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)) };
  const lines = mergedOptions.text!.split('\n');

  try {
    const font = await loadFont(mergedOptions.fontFamily ?? 'helvetiker');

    // Calculate line widths and equalization factors
    const lineWidths: number[] = [];
    const equalizationFactors: number[] = lines.map(() => 1);

    // First pass: calculate natural widths
    for (const line of lines) {
      if (!line.trim()) { lineWidths.push(0); continue; }
      const geometry = new TextGeometry(line, {
        font: font as any,
        size: mergedOptions.size,
        height: mergedOptions.height,
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

    // Calculate equalization factors
    if (mergedOptions.equalizeLineWidths!) {
      for (let i = 0; i < lineWidths.length; i++) {
        const width = lineWidths[i] || 1;
        equalizationFactors[i] = mergedOptions.targetWidth! / width;
      }
    }

    // Create the main group for all lines
    const mainGroup = new THREE.Group();
    const lineGeometries: { geometry: TextGeometry | THREE.Group; minY: number; maxY: number }[] = [];

    // Second pass: create geometries with equalization
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const factor = equalizationFactors[lineIndex];

      if (mergedOptions.equalizationMethod === 'fontSize' || !mergedOptions.equalizeLineWidths) {
        // Empty line → use a blank spacer (no visible geometry, but correct spacing)
        if (!line.trim()) {
          const spacerGroup = new THREE.Group();
          const emptySize = mergedOptions.size! * factor;
          lineGeometries.push({ geometry: spacerGroup, minY: 0, maxY: emptySize * 0.8 });
          continue;
        }
        const lineGeometry = new TextGeometry(line, {
          font: font as any,
          size: mergedOptions.size! * factor,
          height: mergedOptions.height,
          curveSegments: mergedOptions.curveSegments,
          bevelEnabled: mergedOptions.bevelEnabled,
          bevelThickness: mergedOptions.bevelThickness,
          bevelSize: mergedOptions.bevelSize! * factor,
          bevelOffset: mergedOptions.bevelOffset,
          bevelSegments: mergedOptions.bevelSegments,
        } as any);

        lineGeometry.computeBoundingBox();
        const lineWidth = (lineGeometry.boundingBox?.max.x ?? 0) - (lineGeometry.boundingBox?.min.x ?? 0);
        // Store actual geometry extents (X-translate doesn't affect Y)
        const minY = lineGeometry.boundingBox?.min.y ?? 0;
        const maxY = lineGeometry.boundingBox?.max.y ?? mergedOptions.size!;
        lineGeometry.translate(-lineWidth / 2, 0, 0);
        lineGeometries.push({ geometry: lineGeometry, minY, maxY });
      } else {
        // Empty line in spacing mode → spacer
        if (!line.trim()) {
          const spacerGroup = new THREE.Group();
          lineGeometries.push({ geometry: spacerGroup, minY: 0, maxY: mergedOptions.size! * 0.8 });
          continue;
        }
        // Spacing mode: create per-character geometries with extra gaps
        const naturalWidth = lineWidths[lineIndex];
        const extraSpace = (mergedOptions.targetWidth! - naturalWidth) / Math.max(1, line.length - 1);
        const lineGroup = new THREE.Group();
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
            height: mergedOptions.height,
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
          const charMesh = new THREE.Mesh(charGeometry);
          lineGroup.add(charMesh);
          cursorX += charWidth + extraSpace;
        }

        // Compute actual bbox of the assembled line
        const box = lineGroup.children.length > 0
          ? new THREE.Box3().setFromObject(lineGroup)
          : new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, mergedOptions.size!, 0));
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
      if (lineGeometry instanceof THREE.Group) {
        lineGeometry.position.y = yOrigin;
        mainGroup.add(lineGeometry);
      } else {
        lineGeometry.translate(0, yOrigin, 0);
        const lineMesh = new THREE.Mesh(lineGeometry);
        mainGroup.add(lineMesh);
      }
    }

    const color =
      mergedOptions.color || new THREE.Color().setHSL(Math.random(), 0.8, 0.5);

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: mergedOptions.metalness,
      roughness: mergedOptions.roughness,
      envMap: mergedOptions.envMap || undefined,
      envMapIntensity: mergedOptions.envMapIntensity,
    });
    patchBevelNormalReflect(material);
    return { geometry: mainGroup, material };
  } catch (error) {
    console.error("Failed to load font, creating fallback geometry:", error);

    // Fallback: create simple extruded text using basic shapes
    const mainGroup = new THREE.Group();
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
      const lineGroup = new THREE.Group();

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
        const charGeometry = new THREE.BoxGeometry(
          charSize * 0.6,
          charSize,
          mergedOptions.height!,
        );

        const charMesh = new THREE.Mesh(charGeometry);
        charMesh.position.x = currentX;
        lineGroup.add(charMesh);

        currentX += letterSpacing;
      }

      // Center the line horizontally
      const box = new THREE.Box3().setFromObject(lineGroup);
      const center = box.getCenter(new THREE.Vector3());
      lineGroup.position.x = -center.x;

      // Position vertically
      const yOffset = (lines.length - 1) * lineSpacing / 2 - lineIndex * lineSpacing;
      lineGroup.position.y = yOffset;

      mainGroup.add(lineGroup);
    }

    const color =
      mergedOptions.color || new THREE.Color().setHSL(Math.random(), 0.8, 0.5);

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: mergedOptions.metalness,
      roughness: mergedOptions.roughness,
      envMap: mergedOptions.envMap || undefined,
      envMapIntensity: mergedOptions.envMapIntensity,
    });
    patchBevelNormalReflect(material);
    return { geometry: mainGroup, material };
  }
}

export function createTextMesh(
  geometry: TextGeometry,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
