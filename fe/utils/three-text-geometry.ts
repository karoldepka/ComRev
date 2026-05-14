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

  try {
    const font = await loadFont();

    const geometry = new TextGeometry(mergedOptions.text!, {
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

    geometry.center();

    const color =
      mergedOptions.color || new THREE.Color().setHSL(Math.random(), 0.8, 0.5);

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: mergedOptions.metalness,
      roughness: mergedOptions.roughness,
      envMap: mergedOptions.envMap || undefined,
      envMapIntensity: mergedOptions.envMapIntensity,
    });

    return { geometry, material };
  } catch (error) {
    console.error("Failed to load font, creating fallback geometry:", error);

    // Fallback: create simple extruded text using basic shapes
    const group = new THREE.Group();
    const letterSpacing = mergedOptions.size! * 0.8;
    let currentX = 0;

    for (let i = 0; i < mergedOptions.text!.length; i++) {
      const char = mergedOptions.text![i];
      if (char === " ") {
        currentX += letterSpacing * 0.5;
        continue;
      }

      // Create a simple box for each character
      const charGeometry = new THREE.BoxGeometry(
        mergedOptions.size! * 0.6,
        mergedOptions.size!,
        mergedOptions.height!,
      );

      const charMesh = new THREE.Mesh(charGeometry);
      charMesh.position.x = currentX;
      group.add(charMesh);

      currentX += letterSpacing;
    }

    // Center the group
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);

    const color =
      mergedOptions.color || new THREE.Color().setHSL(Math.random(), 0.8, 0.5);

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: mergedOptions.metalness,
      roughness: mergedOptions.roughness,
      envMap: mergedOptions.envMap || undefined,
      envMapIntensity: mergedOptions.envMapIntensity,
    });

    return { geometry: group, material };
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
