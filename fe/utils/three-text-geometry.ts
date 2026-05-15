import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";

export interface TextGeometryOptions {
  text: string;
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
}

const defaultOptions: Partial<TextGeometryOptions> = {
  size: 2,
  height: 0.8,
  curveSegments: 12,
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
};

let fontCache: Font | null = null;

async function loadFont(): Promise<Font> {
  if (fontCache) {
    return fontCache;
  }

  return new Promise((resolve, reject) => {
    // Try multiple CDN URLs
    const urls = [
      "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",
      "https://unpkg.com/three@latest/examples/fonts/helvetiker_regular.typeface.json",
    ];

    const tryLoad = async (index: number) => {
      if (index >= urls.length) {
        reject(new Error("All font URLs failed to load"));
        return;
      }

      try {
        console.log(`Trying font URL: ${urls[index]}`);
        const response = await fetch(urls[index]);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const font = new Font(data);
        fontCache = font;
        console.log("Font loaded successfully");
        resolve(font);
      } catch (error) {
        console.error(`Failed to load from ${urls[index]}:`, error);
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
  const mergedOptions = { ...defaultOptions, ...options };
  const lines = mergedOptions.text!.split('\n');
  const lineHeight = mergedOptions.size! * 1.5; // Vertical spacing between lines

  try {
    const font = await loadFont();

    // Calculate line widths and equalization factors
    const lineWidths: number[] = [];
    const equalizationFactors: number[] = lines.map(() => 1);

    // First pass: calculate natural widths
    for (const line of lines) {
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
      const width = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
      lineWidths.push(width);
    }

    // Calculate equalization factors
    if (mergedOptions.equalizeLineWidths!) {
      const maxWidth = Math.max(...lineWidths);

      for (let i = 0; i < lineWidths.length; i++) {
        const width = lineWidths[i] || 1;
        equalizationFactors[i] = maxWidth / width;
      }
    }

    // Create the main group for all lines
    const mainGroup = new THREE.Group();

    // Second pass: create geometries with equalization
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const factor = equalizationFactors[lineIndex];

      let lineGeometry: TextGeometry;
      if (mergedOptions.equalizationMethod === 'fontSize') {
        lineGeometry = new TextGeometry(line, {
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
      } else {
        // Use normal font size, will adjust spacing later
        lineGeometry = new TextGeometry(line, {
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
      }

      // Center horizontally
      lineGeometry.computeBoundingBox();
      let lineWidth = lineGeometry.boundingBox!.max.x - lineGeometry.boundingBox!.min.x;
      let offsetX = -lineWidth / 2;

      // If using spacing equalization, scale the geometry
      if (mergedOptions.equalizeLineWidths! && mergedOptions.equalizationMethod === 'spacing') {
        lineGeometry.scale(factor, 1, 1);
        // Recalculate bounding box after scaling
        lineGeometry.computeBoundingBox();
        lineWidth = lineGeometry.boundingBox!.max.x - lineGeometry.boundingBox!.min.x;
        offsetX = -lineWidth / 2;
      }

      lineGeometry.translate(offsetX, 0, 0);

      // Position vertically (top to bottom)
      const yOffset = (lines.length - 1) * lineHeight / 2 - lineIndex * lineHeight;
      lineGeometry.translate(0, yOffset, 0);

      // Create mesh and add to main group
      const lineMesh = new THREE.Mesh(lineGeometry);
      mainGroup.add(lineMesh);
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

    return { geometry: mainGroup, material };
  } catch (error) {
    console.error("Failed to load font, creating fallback geometry:", error);

    // Fallback: create simple extruded text using basic shapes
    const mainGroup = new THREE.Group();
    const baseLetterSpacing = mergedOptions.size! * 0.8;
    const lineSpacing = mergedOptions.size! * 1.5;

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
      const maxWidth = Math.max(...lineWidths);
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
