import { createTextGeometry } from "@/utils/three-text-geometry";
import { GLView } from "expo-gl";
import { Renderer } from "expo-three";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface ThreeDTextProps {
  text: string;
}

export const ThreeDText: React.FC<ThreeDTextProps> = ({ text }) => {
  const animationIdRef = useRef<number | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const meshRef = useRef<THREE.Mesh | THREE.Group | null>(null);
  const envMapRef = useRef<THREE.Texture | null>(null);
  const currentTextRef = useRef<string>(text);

  // Update text when prop changes
  useEffect(() => {
    currentTextRef.current = text;
    if (sceneRef.current && envMapRef.current) {
      updateTextMesh(text);
    }
  }, [text]);

  const updateTextMesh = async (textContent: string) => {
    if (!sceneRef.current || !envMapRef.current) return;

    const scene = sceneRef.current;
    const envMap = envMapRef.current;

    // Remove old mesh if it exists
    if (meshRef.current) {
      scene.remove(meshRef.current);
      if (meshRef.current instanceof THREE.Mesh) {
        if (meshRef.current.geometry) {
          meshRef.current.geometry.dispose();
        }
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach((m: any) => m.dispose());
        } else if (meshRef.current.material) {
          meshRef.current.material.dispose();
        }
      } else if (meshRef.current instanceof THREE.Group) {
        // Dispose of all geometries and materials in the group
        meshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m: any) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
    }

    try {
      console.log("Creating text geometry for:", textContent);
      // Create text geometry using the utility
      const { geometry, material } = await createTextGeometry({
        text: textContent,
        envMap: envMap,
      });

      console.log("Geometry created:", geometry);
      let mesh: THREE.Mesh | THREE.Group;
      if (geometry instanceof THREE.Group) {
        mesh = geometry;
        // Apply material to all children
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
      console.log("Adding mesh to scene");
      scene.add(mesh);
      meshRef.current = mesh;
      console.log("Mesh added successfully");
    } catch (error) {
      console.error("Failed to create text geometry:", error);
    }
  };

  const onContextCreate = async (gl: any) => {
    console.log("onContextCreate called");
    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;
    console.log("Scene created");

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000,
    );
    camera.position.z = 8;
    cameraRef.current = camera;
    console.log("Camera setup complete");

    // Renderer setup
    const renderer = new Renderer({ gl });
    const webglRenderer = renderer as any; // Cast to access WebGLRenderer methods
    webglRenderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    webglRenderer.setPixelRatio(1);
    webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    webglRenderer.toneMappingExposure = 1;
    rendererRef.current = renderer;
    console.log("Renderer setup complete");

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const pointLight1 = new THREE.PointLight(0xff00ff, 1.0);
    pointLight1.position.set(-8, 5, 8);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x00ffff, 0.8);
    pointLight2.position.set(8, -5, 8);
    scene.add(pointLight2);
    console.log("Lights added");

    // Create environment map for reflections using canvas
    const createEnvironmentMap = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d")!;

        // Create radial gradient
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.max(centerX, centerY);

        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          radius,
        );
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.3, "#00ff88");
        gradient.addColorStop(0.6, "#0088ff");
        gradient.addColorStop(1, "#1a1a1a");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add some pattern
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, (i + 1) * 100, 0, Math.PI * 2);
          ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        console.log("Environment map created");
        return texture;
      } catch (error) {
        console.error("Failed to create environment map:", error);
        // Return a simple color as fallback
        return null;
      }
    };

    const envMap = createEnvironmentMap();
    envMapRef.current = envMap;
    if (envMap) {
      scene.environment = envMap;
    }

    // Create initial text mesh
    console.log("onContextCreate: calling updateTextMesh");
    await updateTextMesh(currentTextRef.current);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      if (meshRef.current) {
        meshRef.current.rotation.x += 0.003;
        meshRef.current.rotation.y += 0.008;
        meshRef.current.rotation.z += 0.002;
      }

      webglRenderer.render(scene, camera);
      gl.endFrameEXP();
    };

    console.log("Starting animation loop");
    animate();
  };

  return (
    <GLView
      style={{ flex: 1, pointerEvents: "auto" }}
      onContextCreate={onContextCreate}
    />
  );
};
