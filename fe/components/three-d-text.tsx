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
  const meshRef = useRef<THREE.Mesh | null>(null);
  const envMapRef = useRef<THREE.Texture | null>(null);
  const currentTextRef = useRef<string>(text);

  // Update text when prop changes
  useEffect(() => {
    currentTextRef.current = text;
    if (sceneRef.current && envMapRef.current) {
      updateTextMesh(text);
    }
  }, [text]);

  const updateTextMesh = (textContent: string) => {
    if (!sceneRef.current || !envMapRef.current) return;

    const scene = sceneRef.current;
    const envMap = envMapRef.current;

    // Remove old mesh if it exists
    if (meshRef.current) {
      scene.remove(meshRef.current);
      if (meshRef.current.geometry) {
        meshRef.current.geometry.dispose();
      }
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach((m: any) => m.dispose());
      } else if (meshRef.current.material) {
        meshRef.current.material.dispose();
      }
    }

    // Create a lathe geometry to simulate beveled/extruded text
    const points = [];

    // Create a profile curve for beveled extrusion
    const profileHeight = 1;
    const profileDepth = 0.5;
    const bevelSize = 0.15;

    // Bottom left bevel
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(bevelSize, bevelSize));
    // Main face
    points.push(new THREE.Vector2(bevelSize, profileHeight - bevelSize));
    // Top bevel
    points.push(new THREE.Vector2(0, profileHeight));
    // Back (extruded)
    points.push(new THREE.Vector2(profileDepth, profileHeight));
    // Back bottom bevel
    points.push(new THREE.Vector2(profileDepth, profileHeight - bevelSize));
    points.push(new THREE.Vector2(profileDepth - bevelSize, bevelSize));
    // Back bottom
    points.push(new THREE.Vector2(profileDepth - bevelSize, 0));

    const geometry = new THREE.LatheGeometry(points, 32);

    // Scale based on text length
    const scale = Math.max(1, 6 / (textContent.length * 0.5));
    geometry.scale(scale, scale, scale);

    // Create metallic material with strong reflections
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.8, 0.5),
      metalness: 0.95,
      roughness: 0.15,
      envMap: envMap,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.set(Math.min(textContent.length * 0.3, 3), 1, 1);
    scene.add(mesh);
    meshRef.current = mesh;
  };

  const onContextCreate = async (gl: any) => {
    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000,
    );
    camera.position.z = 8;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new Renderer({ gl });
    const webglRenderer = renderer as any; // Cast to access WebGLRenderer methods
    webglRenderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    webglRenderer.setPixelRatio(1);
    webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    webglRenderer.toneMappingExposure = 1;
    rendererRef.current = renderer;

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

    // Create environment map for reflections using canvas
    const createEnvironmentMap = () => {
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
      return texture;
    };

    const envMap = createEnvironmentMap();
    envMapRef.current = envMap;
    scene.environment = envMap;

    // Create initial text mesh
    updateTextMesh(currentTextRef.current);

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

    animate();
  };

  return <GLView style={{ flex: 1, pointerEvents: 'auto' }} onContextCreate={onContextCreate} />;
};
