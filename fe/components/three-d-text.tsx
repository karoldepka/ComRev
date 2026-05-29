import { createTextGeometry } from "@/utils/three-text-geometry";
import { EffectPipe, PipelineManager } from "@/utils/three-text-pipes";
import { GLView } from "expo-gl";
import { Renderer } from "expo-three";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import * as THREE from "three";

interface ThreeDTextProps {
  text: string;
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
  pipes?: EffectPipe[];
}

export const ThreeDText: React.FC<ThreeDTextProps> = ({
  text,
  equalizeLineWidths = false,
  equalizationMethod = 'fontSize',
  targetWidth = 20,
  lineSpacing,
  rays,
  rayMode,
  rayCount,
  rayInnerMargin,
  rayOuterMargin,
  rayThickness,
  pipes = [],
}) => {
  const animationIdRef = useRef<number | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const meshRef = useRef<THREE.Mesh | THREE.Group | null>(null);
  const envMapRef = useRef<THREE.Texture | null>(null);
  const currentTextRef = useRef<string>(text);
  const updateIdRef = useRef(0);
  const pipelineManagerRef = useRef<PipelineManager | null>(null);
  const pipesRef = useRef<EffectPipe[]>(pipes);
  const glRef = useRef<any>(null);
  const widthRef = useRef(0);
  const heightRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const containerRef = useRef<any>(null);

  // Drag rotation state
  const isDraggingRef = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0, y: 0 });

  // Attach wheel listener via DOM (onWheel prop not supported on RN View)
  useEffect(() => {
    const el = containerRef.current as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      const rect = el.getBoundingClientRect();
      const ndx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndy = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const worldPoint = new THREE.Vector3(ndx, ndy, 0.5).unproject(cameraRef.current);
      const dir = worldPoint.sub(cameraRef.current.position).normalize();
      const zoomSpeed = 1.0;
      const zoomDelta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
      const newPos = cameraRef.current.position.clone().addScaledVector(dir, zoomDelta);
      const dist = newPos.length();
      if (dist > 2 && dist < 80) cameraRef.current.position.copy(newPos);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Rebuild PipelineManager when the pipes array reference changes
  useEffect(() => {
    pipesRef.current = pipes;
    if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return;
    pipelineManagerRef.current?.dispose();
    const pm = new PipelineManager(pipes);
    pm.setup({
      scene: sceneRef.current,
      camera: cameraRef.current,
      renderer: rendererRef.current,
      gl: glRef.current,
      width: widthRef.current,
      height: heightRef.current,
    });
    pm.onMeshChanged(meshRef.current);
    pipelineManagerRef.current = pm;
  }, [pipes]);

  // Update text / geometry props
  useEffect(() => {
    currentTextRef.current = text;
    if (sceneRef.current && envMapRef.current) {
      updateTextMesh(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, equalizeLineWidths, equalizationMethod, targetWidth, lineSpacing, rays, rayMode, rayCount, rayInnerMargin, rayOuterMargin, rayThickness]);

  useEffect(() => {
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      pipelineManagerRef.current?.dispose();
    };
  }, []);

  const removeMeshFromScene = (scene: THREE.Scene) => {
    if (meshRef.current) {
      scene.remove(meshRef.current);
      if (meshRef.current instanceof THREE.Mesh) {
        meshRef.current.geometry?.dispose();
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach((m: any) => m.dispose());
        } else {
          meshRef.current.material?.dispose();
        }
      } else if (meshRef.current instanceof THREE.Group) {
        meshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
            else child.material?.dispose();
          }
        });
      }
      meshRef.current = null;
    }
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child !== scene && child !== cameraRef.current && !(child instanceof THREE.Light)) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(m => scene.remove(m));
  };

  const updateTextMesh = async (textContent: string) => {
    if (!sceneRef.current || !envMapRef.current) return;
    const scene = sceneRef.current;
    const envMap = envMapRef.current;
    const thisUpdateId = ++updateIdRef.current;

    removeMeshFromScene(scene);

    try {
      const { geometry, material } = await createTextGeometry({
        text: textContent,
        envMap,
        equalizeLineWidths,
        equalizationMethod,
        targetWidth,
        lineSpacing,
        rays,
        rayMode,
        rayCount,
        rayInnerMargin,
        rayOuterMargin,
        rayThickness,
      });

      if (thisUpdateId !== updateIdRef.current) return;

      let mesh: THREE.Mesh | THREE.Group;
      if (geometry instanceof THREE.Group) {
        mesh = geometry;
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) { child.material = material; child.castShadow = true; child.receiveShadow = true; }
        });
      } else {
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      removeMeshFromScene(scene);
      scene.add(mesh);
      meshRef.current = mesh;
      pipelineManagerRef.current?.onMeshChanged(mesh);
    } catch (error) {
      console.error("Failed to create text geometry:", error);
    }
  };

  const handlePointerDown = (event: any) => {
    isDraggingRef.current = true;
    lastMousePosition.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
  };

  const handlePointerMove = (event: any) => {
    if (!isDraggingRef.current) return;
    const deltaX = event.nativeEvent.pageX - lastMousePosition.current.x;
    const deltaY = event.nativeEvent.pageY - lastMousePosition.current.y;
    rotationRef.current.y += deltaX * 0.01;
    rotationRef.current.x += deltaY * 0.01;
    lastMousePosition.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
  };

  const handlePointerUp = () => { isDraggingRef.current = false; };

  const onContextCreate = async (gl: any) => {
    glRef.current = gl;
    widthRef.current = gl.drawingBufferWidth;
    heightRef.current = gl.drawingBufferHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000);
    camera.position.z = 15;
    cameraRef.current = camera;

    const renderer = new Renderer({ gl });
    const webglRenderer = renderer as any;
    webglRenderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    webglRenderer.setPixelRatio(1);
    webglRenderer.autoClear = true;
    webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    webglRenderer.toneMappingExposure = 1;
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(10, 10, 10); dirLight.castShadow = true;
    scene.add(dirLight);
    const p1 = new THREE.PointLight(0xff00ff, 1.0); p1.position.set(-8, 5, 8); scene.add(p1);
    const p2 = new THREE.PointLight(0x00ffff, 0.8); p2.position.set(8, -5, 8); scene.add(p2);

    const envMap = createDefaultEnvMap();
    envMapRef.current = envMap;
    if (envMap) scene.environment = envMap;

    const pm = new PipelineManager(pipesRef.current);
    pm.setup({ scene, camera, renderer, gl, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight });
    pipelineManagerRef.current = pm;

    await updateTextMesh(currentTextRef.current);

    const t0 = performance.now();
    startTimeRef.current = t0;
    lastFrameTimeRef.current = t0;

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      if (meshRef.current) {
        meshRef.current.rotation.x = rotationRef.current.x;
        meshRef.current.rotation.y = rotationRef.current.y;
      }

      const now = performance.now();
      const time = (now - startTimeRef.current) / 1000;
      const delta = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      const frameCtx = {
        scene,
        camera,
        renderer: webglRenderer,
        gl,
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        mesh: meshRef.current,
        time,
        delta,
      };

      pipelineManagerRef.current?.update(frameCtx);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      if (pipelineManagerRef.current) {
        pipelineManagerRef.current.render(frameCtx);
      } else {
        webglRenderer.render(scene, camera);
      }
      gl.endFrameEXP();
    };

    animate();
  };

  return (
    <View
      ref={containerRef}
      style={{ flex: 1 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
};

function createDefaultEnvMap(): THREE.Texture | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const cx = 256, cy = 256;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 256);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.3, "#00ff88");
    g.addColorStop(0.6, "#0088ff");
    g.addColorStop(1, "#1a1a1a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    ctx.globalAlpha = 0.3; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(cx, cy, (i + 1) * 100, 0, Math.PI * 2); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  } catch {
    return null;
  }
}
