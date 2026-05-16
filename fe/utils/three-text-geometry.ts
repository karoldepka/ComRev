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
  lineSpacing?: number;
  rays?: boolean;
  rayMode?: 'radial' | 'spaghetti' | 'chip';
  rayCount?: number;
  rayInnerMargin?: number;
  rayOuterMargin?: number;
  rayThickness?: number;
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
  lineSpacing: 1.5,
  rays: false,
  rayMode: 'radial',
  rayCount: 24,
  rayInnerMargin: 2,
  rayOuterMargin: 6,
  rayThickness: 0.08,
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
  const mergedOptions = { ...defaultOptions, ...Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)) };
  const lines = mergedOptions.text!.split('\n');

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
      for (let i = 0; i < lineWidths.length; i++) {
        const width = lineWidths[i] || 1;
        equalizationFactors[i] = mergedOptions.targetWidth! / width;
      }
    }

    // Create the main group for all lines
    const mainGroup = new THREE.Group();
    const lineGeometries: { geometry: TextGeometry; height: number }[] = [];

    // Second pass: create geometries with equalization
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const factor = equalizationFactors[lineIndex];

      if (mergedOptions.equalizationMethod === 'fontSize' || !mergedOptions.equalizeLineWidths) {
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
        const lineWidth = lineGeometry.boundingBox!.max.x - lineGeometry.boundingBox!.min.x;
        const lineHeight = (lineGeometry.boundingBox!.max.y - lineGeometry.boundingBox!.min.y) * mergedOptions.lineSpacing!;
        lineGeometry.translate(-lineWidth / 2, 0, 0);
        lineGeometries.push({ geometry: lineGeometry, height: lineHeight });
      } else {
        // Spacing mode: create per-character geometries with extra gaps
        const naturalWidth = lineWidths[lineIndex];
        const extraSpace = (mergedOptions.targetWidth! - naturalWidth) / Math.max(1, line.length - 1);
        const lineGroup = new THREE.Group();
        let cursorX = 0;
        let maxCharHeight = 0;

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
          const charHeight = charGeometry.boundingBox!.max.y - charGeometry.boundingBox!.min.y;
          maxCharHeight = Math.max(maxCharHeight, charHeight);

          charGeometry.translate(cursorX, 0, 0);
          const charMesh = new THREE.Mesh(charGeometry);
          lineGroup.add(charMesh);

          cursorX += charWidth + extraSpace;
        }

        // Center the line group horizontally
        const box = new THREE.Box3().setFromObject(lineGroup);
        const centerX = (box.max.x + box.min.x) / 2;
        lineGroup.position.x = -centerX;

        const lineHeight = maxCharHeight * mergedOptions.lineSpacing!;
        lineGeometries.push({ geometry: lineGroup as any, height: lineHeight });
      }
    }

    // Position lines vertically using actual heights
    const totalHeight = lineGeometries.reduce((sum: number, l) => sum + l.height, 0);
    let yPos = totalHeight / 2;

    for (const { geometry: lineGeometry, height } of lineGeometries) {
      yPos -= height;
      const yOffset = yPos + height / 2;

      if (lineGeometry instanceof THREE.Group) {
        lineGeometry.position.y = yOffset;
        mainGroup.add(lineGeometry);
      } else {
        lineGeometry.translate(0, yOffset, 0);
        const lineMesh = new THREE.Mesh(lineGeometry);
        mainGroup.add(lineMesh);
      }
    }

    // Add rays if enabled
    if (mergedOptions.rays) {
      const box = new THREE.Box3().setFromObject(mainGroup);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const rayCount = mergedOptions.rayCount!;
      const thickness = mergedOptions.rayThickness!;
      const depth = mergedOptions.height! * 0.5;
      const innerMargin = mergedOptions.rayInnerMargin!;
      const outerMargin = mergedOptions.rayOuterMargin!;

      if (mergedOptions.rayMode === 'radial') {
        const halfDiag = Math.sqrt(size.x * size.x + size.y * size.y) / 2;
        const innerRadius = halfDiag + innerMargin;
        const outerRadius = halfDiag + innerMargin + outerMargin;

        for (let i = 0; i < rayCount; i++) {
          const angle = (i / rayCount) * Math.PI * 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          const length = outerRadius - innerRadius;
          const rayGeo = new THREE.BoxGeometry(length, thickness, depth);
          const rayMesh = new THREE.Mesh(rayGeo);

          const midRadius = (innerRadius + outerRadius) / 2;
          rayMesh.position.set(
            center.x + cos * midRadius,
            center.y + sin * midRadius,
            center.z
          );
          rayMesh.rotation.z = angle;
          mainGroup.add(rayMesh);
        }
      } else if (mergedOptions.rayMode === 'spaghetti') {
        const halfDiag = Math.sqrt(size.x * size.x + size.y * size.y) / 2;
        const innerRadius = halfDiag + innerMargin;
        const outerRadius = halfDiag + innerMargin + outerMargin;

        const seed = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5;

        for (let i = 0; i < rayCount; i++) {
          const baseAngle = (i / rayCount) * Math.PI * 2;
          const wobble = (seed(i) - 0.5) * 0.4;
          const angle = baseAngle + wobble;

          const lengthVariation = 0.5 + seed(i + 50);
          const thisOuter = innerRadius + (outerRadius - innerRadius) * lengthVariation;
          const length = thisOuter - innerRadius;

          const points: THREE.Vector3[] = [];
          const segments = 8;
          for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const r = innerRadius + length * t;
            const curveWobble = Math.sin(t * Math.PI * 2 + seed(i * 3) * 10) * 0.3;
            const a = angle + curveWobble * (1 - t * 0.5);
            points.push(new THREE.Vector3(
              center.x + Math.cos(a) * r,
              center.y + Math.sin(a) * r,
              center.z
            ));
          }

          const curve = new THREE.CatmullRomCurve3(points);
          const tubeGeo = new THREE.TubeGeometry(curve, 16, thickness * 0.5, 4, false);
          const rayMesh = new THREE.Mesh(tubeGeo);
          mainGroup.add(rayMesh);
        }
      } else if (mergedOptions.rayMode === 'chip') {
        const halfW = size.x / 2 + innerMargin;
        const halfH = size.y / 2 + innerMargin;
        const outerHalfW = halfW + outerMargin;
        const outerHalfH = halfH + outerMargin;
        const perSide = Math.ceil(rayCount / 4);

        for (let side = 0; side < 4; side++) {
          for (let i = 0; i < perSide; i++) {
            const t = (i + 0.5) / perSide;

            let startX: number, startY: number, endX: number, endY: number;

            if (side === 0) { // top
              startX = center.x + (t - 0.5) * size.x;
              startY = center.y + halfH;
              endX = startX;
              endY = center.y + outerHalfH;
            } else if (side === 1) { // right
              startX = center.x + halfW;
              startY = center.y + (t - 0.5) * size.y;
              endX = center.x + outerHalfW;
              endY = startY;
            } else if (side === 2) { // bottom
              startX = center.x + (t - 0.5) * size.x;
              startY = center.y - halfH;
              endX = startX;
              endY = center.y - outerHalfH;
            } else { // left
              startX = center.x - halfW;
              startY = center.y + (t - 0.5) * size.y;
              endX = center.x - outerHalfW;
              endY = startY;
            }

            const len = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
            const rayGeo = new THREE.BoxGeometry(len, thickness, depth);
            const rayMesh = new THREE.Mesh(rayGeo);

            rayMesh.position.set(
              (startX + endX) / 2,
              (startY + endY) / 2,
              center.z
            );
            rayMesh.rotation.z = Math.atan2(endY - startY, endX - startX);
            mainGroup.add(rayMesh);
          }
        }
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
