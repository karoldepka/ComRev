import { createTextGeometry } from "@/utils/three-text-geometry";
import { EffectPipe, PipelineManager } from "@/utils/three-text-pipes";
import { GLView } from "expo-gl";
import { Renderer } from "expo-three";
import React, { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { LayoutChangeEvent, View } from "react-native";
import * as THREE from "three";

export interface ThreeDTextHandle {
  /** Captures the current rendered frame and returns a PNG data URL. */
  captureFrame(): Promise<string | null>;
  /** Returns the current text mesh, for use in 3D model exporters. */
  getMesh(): THREE.Mesh | THREE.Group | null;
  /** Returns the scene, for use in 3D model exporters. */
  getScene(): THREE.Scene | null;
  /** Resets the camera to its default position and clears any orbit rotation. */
  resetCamera(): void;
  /** Adjusts camera Z so the whole mesh fits within the viewport with a margin. */
  fitCamera(margin?: number): void;
}

interface ThreeDTextProps {
  text?: string;
  fontFamily?: string;
  size?: number;
  height?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
  color?: number;
  metalness?: number;
  roughness?: number;
  envMapIntensity?: number;
  equalizeLineWidths?: boolean;
  equalizationMethod?: "spacing" | "fontSize";
  targetWidth?: number;
  lineSpacing?: number;
  pipes?: EffectPipe[];
  onPrimaryMeshClick?: () => void;
  onNonPrimaryTap?: (effectInstanceId: string) => void;
}

export const ThreeDText = React.forwardRef<ThreeDTextHandle, ThreeDTextProps>(
  function ThreeDText(
    {
      text = "",
      fontFamily,
      size,
      height,
      curveSegments,
      bevelEnabled,
      bevelThickness,
      bevelSize,
      bevelOffset,
      bevelSegments,
      color,
      metalness,
      roughness,
      envMapIntensity,
      equalizeLineWidths = false,
      equalizationMethod = "fontSize",
      targetWidth = 20,
      lineSpacing,
      pipes = [],
      onPrimaryMeshClick,
      onNonPrimaryTap,
    },
    ref,
  ) {
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

    const capturePendingRef = useRef<((data: string | null) => void) | null>(
      null,
    );

    useImperativeHandle(ref, () => ({
      captureFrame: () =>
        new Promise<string | null>((resolve) => {
          capturePendingRef.current = resolve;
        }),
      getMesh: () => meshRef.current,
      getScene: () => sceneRef.current,
      resetCamera: () => {
        if (cameraRef.current) {
          cameraRef.current.position.set(0, 0, 15);
          cameraRef.current.lookAt(0, 0, 0);
        }
        rotationRef.current = { x: 0, y: 0 };
      },
      fitCamera: (margin = 1.18) => {
        const camera = cameraRef.current;
        const mesh = meshRef.current;
        if (!camera || !mesh) return;
        const bbox = new THREE.Box3().setFromObject(mesh);
        const halfW = (bbox.max.x - bbox.min.x) / 2;
        const halfH = (bbox.max.y - bbox.min.y) / 2;
        const fovRad = (camera.fov * Math.PI) / 180;
        const aspect = widthRef.current / Math.max(1, heightRef.current);
        const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
        const distForHeight = halfH / Math.tan(fovRad / 2);
        const distForWidth  = halfW / Math.tan(hFovRad / 2);
        const dist = Math.max(distForHeight, distForWidth) * margin;
        camera.position.set(0, 0, Math.max(5, dist));
        camera.lookAt(0, 0, 0);
      },
    }));

    // Interaction state
    const isDraggingRef = useRef(false);
    const lastMousePosition = useRef({ x: 0, y: 0 });
    const pointerDownPos = useRef({ x: 0, y: 0 });
    const pointerDownOnPrimary = useRef(false);
    const pointerDownHitRef = useRef<THREE.Object3D | null>(null);
    const rotationRef = useRef({ x: 0, y: 0 });
    // Object selection / 3D drag
    const raycasterRef = useRef(new THREE.Raycaster());
    const selectedObjectRef = useRef<THREE.Object3D | null>(null); // drag primary
    const selectedObjectsRef = useRef<Set<THREE.Object3D>>(new Set()); // persistent multi-selection
    const dragModeRef = useRef<"rotate" | "translate">("rotate");
    const dragPlaneRef = useRef(new THREE.Plane());
    const dragOffsetRef = useRef(new THREE.Vector3());
    // Pinch zoom state
    const isPinchingRef = useRef(false);
    const pinchStartDistRef = useRef(0);
    const pinchStartCamPosRef = useRef(new THREE.Vector3());

    // Returns the 3D scene-center focus point under the given NDC coordinates.
    // Uses a plane through the origin perpendicular to the camera's view direction.
    const getZoomTarget = useCallback((ndx: number, ndy: number): THREE.Vector3 => {
      const camera = cameraRef.current;
      if (!camera) return new THREE.Vector3();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndx, ndy), camera);
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const focusPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, new THREE.Vector3());
      const target = new THREE.Vector3();
      if (!ray.ray.intersectPlane(focusPlane, target)) target.set(0, 0, 0);
      return target;
    }, []);

    // Zooms camera toward/away from `target` by `scaleFactor` (< 1 = zoom in).
    const applyZoom = useCallback((scaleFactor: number, target: THREE.Vector3) => {
      const camera = cameraRef.current;
      if (!camera) return;
      const offset = camera.position.clone().sub(target);
      const newPos = target.clone().addScaledVector(offset, scaleFactor);
      const dist = newPos.length();
      if (dist >= 2 && dist <= 80) camera.position.copy(newPos);
    }, []);

    // Wheel + pinch zoom via DOM events
    useEffect(() => {
      const el = containerRef.current as HTMLElement | null;
      if (!el?.addEventListener) return;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!cameraRef.current) return;
        const rect = el.getBoundingClientRect();
        const ndx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndy = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        // Normalize delta across deltaMode values
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 40;
        if (e.deltaMode === 2) delta *= 800;
        // scaleFactor > 1 = camera moves further (zoom out), < 1 = zoom in
        const scaleFactor = Math.pow(1.001, delta);
        applyZoom(scaleFactor, getZoomTarget(ndx, ndy));
      };

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 2) return;
        e.preventDefault();
        isPinchingRef.current = true;
        isDraggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
        pinchStartCamPosRef.current.copy(
          cameraRef.current?.position ?? new THREE.Vector3(0, 0, 15),
        );
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 2 || !isPinchingRef.current) return;
        e.preventDefault();
        if (!cameraRef.current || pinchStartDistRef.current === 0) return;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // scaleFactor: fingers spreading → dist > start → scaleFactor < 1 → zoom in
        const scaleFactor = pinchStartDistRef.current / dist;
        const newPos = pinchStartCamPosRef.current.clone().multiplyScalar(scaleFactor);
        const d = newPos.length();
        if (d >= 2 && d <= 80) cameraRef.current.position.copy(newPos);
      };

      const onTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) {
          isPinchingRef.current = false;
          pinchStartDistRef.current = 0;
        }
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd);
      return () => {
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
      };
    }, [applyZoom, getZoomTarget]);

    // Rebuild PipelineManager when the pipes array reference changes
    useEffect(() => {
      pipesRef.current = pipes;
      if (!sceneRef.current || !rendererRef.current || !cameraRef.current)
        return;
      pipelineManagerRef.current?.restoreGeometry();
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
    }, [
      text,
      fontFamily,
      size,
      height,
      curveSegments,
      bevelEnabled,
      bevelThickness,
      bevelSize,
      bevelOffset,
      bevelSegments,
      color,
      metalness,
      roughness,
      envMapIntensity,
      equalizeLineWidths,
      equalizationMethod,
      targetWidth,
      lineSpacing,
    ]);

    useEffect(() => {
      return () => {
        if (animationIdRef.current)
          cancelAnimationFrame(animationIdRef.current);
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
              if (Array.isArray(child.material))
                child.material.forEach((m: any) => m.dispose());
              else child.material?.dispose();
            }
          });
        }
        meshRef.current = null;
      }
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
          fontFamily,
          size,
          height,
          curveSegments,
          bevelEnabled,
          bevelThickness,
          bevelSize,
          bevelOffset,
          bevelSegments,
          color: color !== undefined ? new THREE.Color(color) : undefined,
          metalness,
          roughness,
          envMap,
          envMapIntensity,
          equalizeLineWidths,
          equalizationMethod,
          targetWidth,
          lineSpacing,
        });

        if (thisUpdateId !== updateIdRef.current) return;

        let mesh: THREE.Mesh | THREE.Group;
        if (geometry instanceof THREE.Group) {
          mesh = geometry;
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
      const px = event.nativeEvent.pageX;
      const py = event.nativeEvent.pageY;
      lastMousePosition.current = { x: px, y: py };
      pointerDownPos.current = { x: px, y: py };
      pointerDownOnPrimary.current = false;
      const isMultiSelect = !!(event.nativeEvent?.ctrlKey || event.nativeEvent?.metaKey);

      const el = containerRef.current as HTMLElement | null;
      if (!el || !cameraRef.current || !sceneRef.current) {
        dragModeRef.current = "rotate";
        return;
      }

      const rect = el.getBoundingClientRect();
      const ndx = ((px - rect.left) / rect.width) * 2 - 1;
      const ndy = -((py - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(
        new THREE.Vector2(ndx, ndy),
        cameraRef.current,
      );

      const meshes: THREE.Object3D[] = [];
      sceneRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });

      const hits = raycasterRef.current.intersectObjects(meshes);
      if (hits.length > 0) {
        // Walk up to top-level scene child
        let hit: THREE.Object3D = hits[0].object;
        while (hit.parent && hit.parent !== sceneRef.current) hit = hit.parent;

        // Primary text mesh → just rotate the scene; other objects → translate them
        const isPrimaryMesh =
          hit === meshRef.current ||
          isAncestor(meshRef.current, hits[0].object);
        if (isPrimaryMesh) {
          dragModeRef.current = "rotate";
          selectedObjectRef.current = null;
          if (!isMultiSelect) selectedObjectsRef.current.clear();
          pointerDownOnPrimary.current = true;
          pointerDownHitRef.current = null;
        } else {
          dragModeRef.current = "translate";
          if (isMultiSelect) {
            if (selectedObjectsRef.current.has(hit)) {
              selectedObjectsRef.current.delete(hit);
            } else {
              selectedObjectsRef.current.add(hit);
            }
          } else {
            selectedObjectsRef.current.clear();
            selectedObjectsRef.current.add(hit);
          }
          selectedObjectRef.current = hit;
          pointerDownHitRef.current = hit;
          const cameraDir = new THREE.Vector3();
          cameraRef.current.getWorldDirection(cameraDir);
          dragPlaneRef.current.setFromNormalAndCoplanarPoint(
            cameraDir,
            hits[0].point,
          );
          const intersection = new THREE.Vector3();
          raycasterRef.current.ray.intersectPlane(
            dragPlaneRef.current,
            intersection,
          );
          dragOffsetRef.current.copy(hit.position).sub(intersection);
        }
      } else {
        dragModeRef.current = "rotate";
        selectedObjectRef.current = null;
        if (!isMultiSelect) selectedObjectsRef.current.clear();
        pointerDownHitRef.current = null;
      }
    };

    const handlePointerMove = (event: any) => {
      if (!isDraggingRef.current || isPinchingRef.current) return;
      const px = event.nativeEvent.pageX;
      const py = event.nativeEvent.pageY;
      const deltaX = px - lastMousePosition.current.x;
      const deltaY = py - lastMousePosition.current.y;

      if (
        dragModeRef.current === "translate" &&
        selectedObjectRef.current &&
        cameraRef.current
      ) {
        const el = containerRef.current as HTMLElement | null;
        if (el) {
          const rect = el.getBoundingClientRect();
          const ndx = ((px - rect.left) / rect.width) * 2 - 1;
          const ndy = -((py - rect.top) / rect.height) * 2 + 1;
          raycasterRef.current.setFromCamera(
            new THREE.Vector2(ndx, ndy),
            cameraRef.current,
          );
          const intersection = new THREE.Vector3();
          if (
            raycasterRef.current.ray.intersectPlane(
              dragPlaneRef.current,
              intersection,
            )
          ) {
            const newPrimPos = intersection.clone().add(dragOffsetRef.current);
            const delta = newPrimPos.clone().sub(selectedObjectRef.current.position);
            // Move all selected objects by the same delta (includes primary)
            selectedObjectsRef.current.forEach(obj => obj.position.add(delta));
            // If primary not in set (safety), set it directly
            if (!selectedObjectsRef.current.has(selectedObjectRef.current)) {
              selectedObjectRef.current.position.copy(newPrimPos);
            }
          }
        }
      } else {
        rotationRef.current.y += deltaX * 0.01;
        rotationRef.current.x += deltaY * 0.01;
      }
      lastMousePosition.current = { x: px, y: py };
    };

    const handlePointerUp = (event: any) => {
      isDraggingRef.current = false;
      const hitObject = pointerDownHitRef.current;
      selectedObjectRef.current = null;
      pointerDownHitRef.current = null;
      dragModeRef.current = "rotate";

      const dx = (event?.nativeEvent?.pageX ?? 0) - pointerDownPos.current.x;
      const dy = (event?.nativeEvent?.pageY ?? 0) - pointerDownPos.current.y;
      const wasTap = Math.sqrt(dx * dx + dy * dy) < 8;

      if (pointerDownOnPrimary.current && wasTap) {
        onPrimaryMeshClick?.();
      } else if (wasTap && hitObject && onNonPrimaryTap) {
        // Walk up the hierarchy to find the nearest effectInstanceId in userData
        let obj: THREE.Object3D | null = hitObject;
        while (obj) {
          if (obj.userData?.effectInstanceId) {
            onNonPrimaryTap(obj.userData.effectInstanceId);
            break;
          }
          obj = obj.parent;
        }
      }
      pointerDownOnPrimary.current = false;
    };

    const onContextCreate = async (gl: any) => {
      glRef.current = gl;
      widthRef.current = gl.drawingBufferWidth;
      heightRef.current = gl.drawingBufferHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        75,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        1000,
      );
      camera.position.z = 15;
      cameraRef.current = camera;

      const renderer = new Renderer({ gl, antialias: true });
      const webglRenderer = renderer as any;
      webglRenderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      webglRenderer.autoClear = true;
      webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      webglRenderer.toneMappingExposure = 1;
      rendererRef.current = renderer;

      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
      dirLight.position.set(10, 10, 10);
      dirLight.castShadow = true;
      scene.add(dirLight);
      const p1 = new THREE.PointLight(0xff00ff, 1.0);
      p1.position.set(-8, 5, 8);
      scene.add(p1);
      const p2 = new THREE.PointLight(0x00ffff, 0.8);
      p2.position.set(8, -5, 8);
      scene.add(p2);

      const envMap = createDefaultEnvMap();
      envMapRef.current = envMap;
      if (envMap) scene.environment = envMap;

      const pm = new PipelineManager(pipesRef.current);
      pm.setup({
        scene,
        camera,
        renderer,
        gl,
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
      });
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

        // Highlight selected non-primary object with a subtle emissive pulse
        const sel = selectedObjectRef.current;
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material) {
            const mats = Array.isArray(obj.material)
              ? obj.material
              : [obj.material];
            const isSelected = sel && isAncestor(sel, obj);
            mats.forEach((mat: any) => {
              if (mat.emissive && !isAncestor(meshRef.current, obj)) {
                mat.emissive.setScalar(isSelected ? 0.25 : 0);
              }
            });
          }
        });

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
        gl.clear(
          gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT,
        );
        if (pipelineManagerRef.current) {
          pipelineManagerRef.current.render(frameCtx);
        } else {
          webglRenderer.render(scene, camera);
        }
        if (capturePendingRef.current) {
          try {
            const canvas = (gl as any).canvas as HTMLCanvasElement | undefined;
            const dataUrl = canvas?.toDataURL?.("image/png") ?? null;
            capturePendingRef.current(dataUrl);
          } catch {
            capturePendingRef.current(null);
          }
          capturePendingRef.current = null;
        }
        gl.endFrameEXP();
      };

      animate();
    };

    const applyResize = useCallback((cssW: number, cssH: number) => {
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (w === widthRef.current && h === heightRef.current) return;
      widthRef.current = w;
      heightRef.current = h;
      const webglRenderer = rendererRef.current as any;
      webglRenderer?.setSize(w, h, false);
      if (cameraRef.current) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
      }
      pipelineManagerRef.current?.resize(w, h);
    }, []);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      const { width: cssW, height: cssH } = e.nativeEvent.layout;
      applyResize(cssW, cssH);
    }, [applyResize]);

    // Handle browser fullscreen / window resize events (web only)
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const onResize = () => {
        const el = containerRef.current;
        if (!el) return;
        const rect = typeof el.getBoundingClientRect === 'function'
          ? el.getBoundingClientRect()
          : null;
        if (rect && rect.width > 0 && rect.height > 0) {
          applyResize(rect.width, rect.height);
        }
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [applyResize]);

    return (
      <View
        ref={containerRef}
        style={{ flex: 1 }}
        onLayout={handleLayout}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
      </View>
    );
  },
);

function isAncestor(
  ancestor: THREE.Object3D | null,
  child: THREE.Object3D,
): boolean {
  if (!ancestor) return false;
  let node: THREE.Object3D | null = child;
  while (node) {
    if (node === ancestor) return true;
    node = node.parent;
  }
  return false;
}

function createDefaultEnvMap(): THREE.Texture | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const cx = 256,
      cy = 256;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 256);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.3, "#00ff88");
    g.addColorStop(0.6, "#0088ff");
    g.addColorStop(1, "#1a1a1a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (i + 1) * 100, 0, Math.PI * 2);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  } catch {
    return null;
  }
}
