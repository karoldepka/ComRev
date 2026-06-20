/**
 * <threed-text> — self-contained 3D text Web Component.
 *
 * Attributes (all optional, all updatable at runtime):
 *   text          — display text; use \n for line breaks (default: "Hello\nWorld")
 *   color         — hex color e.g. "#ff6600" (default: "#ff6600")
 *   font          — font id, e.g. "droid_sans" (default: "droid_sans")
 *   font-size     — text size in CSS pixels, float (default: "120")
 *   depth         — extrusion depth, float (default: "0.8")
 *   metalness     — 0–1 (default: "0.95")
 *   roughness     — 0–1 (default: "0.15")
 *   env-intensity   — retained for API compatibility; compact build uses direct lighting
 *   scroll-zoom     — set to "true" to enable mouse-wheel scroll zoom; pinch-to-zoom always works (default: disabled)
 *   auto-size       — set to "false" to disable; when enabled, element height is computed from text bounding box (default: enabled)
 *   capitalize      — boolean attr; converts displayed text to upper case (default: absent)
 *   primary-color   — hex color for UI accents + default text color (default: "#ff6600")
 *   secondary-color — hex CSS variable for consumer styling (default: "#0066ff")
 *
 * Events:
 *   config-change — CustomEvent<ThreedTextConfig>; fired on every config change
 *
 * Properties:
 *   config        — get/set the full config object at once
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Group,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PMREMGenerator,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import {
  createTextGeometry,
  DEFAULT_3D_FONT_FAMILY,
} from "../../utils/three-text-geometry";

export interface ThreedTextConfig {
  text: string;
  color: string;
  font: string;
  fontSize: number;
  depth: number;
  metalness: number;
  roughness: number;
  fov: number;
  envIntensity: number;
  capitalize: boolean;
  rotateZ: number;
}

const DEFAULTS: ThreedTextConfig = {
  text: "Hello\nWorld",
  color: "#ff6600",
  font: DEFAULT_3D_FONT_FAMILY,
  fontSize: 120,
  depth: 0.8,
  metalness: 0.95,
  roughness: 0.15,
  envIntensity: 1.5,
  fov: 75,
  capitalize: false,
  rotateZ: 0,
};

const ZOOM_TARGET_PLANE = new Plane(new Vector3(0, 0, 1), 0);

// ── Animated plasma env-map shader ───────────────────────────────────────────

const PLASMA_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

const PLASMA_STOP_COUNT = 4;

function computePlasmaStops(primary: Color, secondary: Color): Vector4[] {
  return [
    new Vector4(0,    secondary.r * 0.4, secondary.g * 0.4, secondary.b * 0.4),
    new Vector4(0.33, primary.r   * 0.6, primary.g   * 0.6, primary.b   * 0.6),
    new Vector4(0.66, primary.r,          primary.g,          primary.b        ),
    new Vector4(1.0,  secondary.r,        secondary.g,        secondary.b      ),
    new Vector4(0, 0, 0, 0),
  ];
}

const PLASMA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uZoom;
uniform vec4  uStop0, uStop1, uStop2, uStop3, uStop4;
uniform int   uStopCount;
varying vec2  vUv;

vec3 palette(float t) {
  vec4 stops[5];
  stops[0]=uStop0; stops[1]=uStop1; stops[2]=uStop2; stops[3]=uStop3; stops[4]=uStop4;
  t=clamp(t,0.0,1.0);
  vec3 lo=stops[0].yzw, hi=stops[uStopCount-1].yzw;
  for(int i=0;i<4;i++){
    if(i>=uStopCount-1) break;
    float ta=stops[i].x, tb=stops[i+1].x;
    if(t>=ta && t<=tb){
      float f=(tb-ta)<0.0001?0.0:(t-ta)/(tb-ta);
      lo=stops[i].yzw; hi=stops[i+1].yzw;
      return mix(lo,hi,f);
    }
  }
  return mix(lo,hi,t);
}

void main() {
  float s = uZoom;
  float v  = sin(vUv.x*s + uTime*1.4);
        v += sin(vUv.y*s*0.9 + uTime*1.1);
        v += sin((vUv.x+vUv.y)*s*0.65 + uTime*0.75);
        v += sin(sqrt(pow(vUv.x-0.5,2.0)+pow(vUv.y-0.5,2.0))*s*2.5 - uTime*1.2);
  float t = (sin(v*1.5)+1.0)*0.5;
  gl_FragColor = vec4(palette(t), 1.0);
}
`;

// ── Styles (shadow DOM) ───────────────────────────────────────────────────────

const STYLES = `
  :host {
    --primary-color: #ff6600;
    --secondary-color: #0066ff;
    display: inline-block;
    position: relative;
    width: 400px;
    height: 400px;
    background: transparent;
    border-radius: 5px;
    overflow: hidden;
  }
  canvas {
    display: block;
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100%; height: 100%;
  }
`;


// ── Web Component ─────────────────────────────────────────────────────────────

export class ThreedTextElement extends HTMLElement {
  static get observedAttributes() {
    return [
      "text",
      "color",
      "font",
      "font-size",
      "depth",
      "metalness",
      "roughness",
      "env-intensity",
      "fov",
      "scroll-zoom",
      "primary-color",
      "secondary-color",
      "auto-size",
      "drag-rotate",
      "capitalize",
      "rotate-z",
    ];
  }

  private _cfg: ThreedTextConfig = { ...DEFAULTS };
  private _shadow!: ShadowRoot;
  private _canvas!: HTMLCanvasElement;
  private _renderer: WebGLRenderer | null = null;
  private _scene: Scene | null = null;
  private _camera: PerspectiveCamera | null = null;
  private _mesh: Mesh | Group | null = null;
  private _animId: number | null = null;
  private _resizeOb: ResizeObserver | null = null;
  private _updateId = 0;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _rotation = { x: 0, y: 0 };
  private _drag = false;
  private _lastMouse = { x: 0, y: 0 };
  private _scrollZoom = false;
  private _dragRotate = true;
  private _autoSize = true;
  private _textBoundingSize: Vector3 | null = null;
  private _styleObserver: MutationObserver | null = null;
  private _startTime = performance.now();
  private _envMap: Texture | null = null;
  private _primaryColor = new Color("#ff6600");
  private _secondaryColor = new Color("#0066ff");
  private _plasmaRt: WebGLRenderTarget | null = null;
  private _plasmaMat: ShaderMaterial | null = null;
  private _plasmaScene: Scene | null = null;
  private _plasmaCamera: OrthographicCamera | null = null;
  private _pmremGenerator: PMREMGenerator | null = null;
  private _pmremRt: WebGLRenderTarget | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._buildDOM();
    this._initScene();
  }

  disconnectedCallback() {
    this._dispose();
  }

  attributeChangedCallback(
    name: string,
    _old: string | null,
    value: string | null,
  ) {
    if (value === null) return;
    switch (name) {
      case "text":
        this._cfg.text = value.replace(/\\n/g, "\n");
        break;
      case "color":
        this._cfg.color = value;
        break;
      case "font":
        this._cfg.font = value;
        break;
      case "font-size":
        this._cfg.fontSize = parseFloat(value);
        break;
      case "depth":
        this._cfg.depth = parseFloat(value);
        break;
      case "metalness":
        this._cfg.metalness = parseFloat(value);
        break;
      case "roughness":
        this._cfg.roughness = parseFloat(value);
        break;
      case "env-intensity":
        this._cfg.envIntensity = parseFloat(value);
        break;
      case "fov":
        this._cfg.fov = parseFloat(value);
        break;
      case "capitalize":
        this._cfg.capitalize = value !== "false";
        break;
      case "rotate-z":
        this._cfg.rotateZ = parseFloat(value);
        break;
      case "scroll-zoom":
        this._scrollZoom = value !== "false";
        return;
      case "drag-rotate":
        this._dragRotate = value !== "false";
        this._canvas?.style.setProperty(
          "cursor",
          this._dragRotate ? "grab" : "default",
        );
        return;
      case "auto-size":
        this._autoSize = value !== "false";
        if (this._autoSize && this._textBoundingSize) {
          this._applyAutoSize();
          this._fitCameraToTextSize(this._textBoundingSize);
        }
        return;
      case "primary-color":
        this.style.setProperty("--primary-color", value);
        this._primaryColor.set(value);
        this._updatePlasmaColors();
        if (!this.hasAttribute("color")) {
          this._cfg.color = value;
          this._scheduleUpdate();
        }
        return;
      case "secondary-color":
        this.style.setProperty("--secondary-color", value);
        this._secondaryColor.set(value);
        this._updatePlasmaColors();
        return;
    }
    this._scheduleUpdate();
  }

  // ── Public property ────────────────────────────────────────────────────────

  get config(): ThreedTextConfig {
    return { ...this._cfg };
  }
  set config(value: Partial<ThreedTextConfig>) {
    Object.assign(this._cfg, value);
    this._scheduleUpdate();
  }

  // ── DOM build ─────────────────────────────────────────────────────────────

  private _buildDOM() {
    const style = document.createElement("style");
    style.textContent = STYLES;
    this._shadow.appendChild(style);

    this._canvas = document.createElement("canvas");
    this._shadow.appendChild(this._canvas);

    // Re-apply sizing when font-size changes via inline style or class swap
    this._styleObserver = new MutationObserver(() => this._onFontSizeChange());
    this._styleObserver.observe(this, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    this._canvas.style.cursor = "grab";
    this._canvas.addEventListener("mousedown", (e) => {
      if (!this._dragRotate) return;
      this._drag = true;
      this._canvas.style.cursor = "grabbing";
      this._lastMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mousemove", (e) => {
      if (!this._drag) return;
      this._rotation.y += (e.clientX - this._lastMouse.x) * 0.01;
      this._rotation.x += (e.clientY - this._lastMouse.y) * 0.01;
      this._lastMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseup", () => {
      if (!this._drag) return;
      this._drag = false;
      this._canvas.style.cursor = this._dragRotate ? "grab" : "default";
    });

    // Wheel zoom — ctrlKey=true means trackpad/browser pinch gesture, always allow
    this._canvas.addEventListener(
      "wheel",
      (e) => {
        const isPinch = e.ctrlKey;
        if (!this._scrollZoom && !isPinch) return;
        e.preventDefault();
        if (!this._camera) return;
        const factor = Math.pow(
          1.001,
          e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1),
        );
        this._zoomCameraAtClientPoint(e.clientX, e.clientY, factor);
      },
      { passive: false },
    );

    // Touch pinch-to-zoom (always active, independent of scroll-zoom setting)
    let lastPinchDist = 0;
    this._canvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 2) {
          lastPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
        }
      },
      { passive: true },
    );
    this._canvas.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 2 || !this._camera) return;
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (lastPinchDist > 0) {
          const scale = lastPinchDist / dist;
          this._zoomCameraAtClientPoint(
            (e.touches[0].clientX + e.touches[1].clientX) / 2,
            (e.touches[0].clientY + e.touches[1].clientY) / 2,
            scale,
          );
        }
        lastPinchDist = dist;
      },
      { passive: false },
    );
    this._canvas.addEventListener(
      "touchend",
      () => {
        lastPinchDist = 0;
      },
      { passive: true },
    );
  }

  private _zoomCameraAtClientPoint(
    clientX: number,
    clientY: number,
    factor: number,
  ) {
    if (!this._camera) return;
    const before = this._worldPointAtClientPoint(clientX, clientY);
    const nextZ = Math.max(2, Math.min(80, this._camera.position.z * factor));
    if (nextZ === this._camera.position.z) return;

    this._camera.position.z = nextZ;
    const after = this._worldPointAtClientPoint(clientX, clientY);
    if (!before || !after) return;

    this._camera.position.x += before.x - after.x;
    this._camera.position.y += before.y - after.y;
    this._camera.updateMatrixWorld(true);
  }

  private _worldPointAtClientPoint(
    clientX: number,
    clientY: number,
  ): Vector3 | null {
    if (!this._camera || !this._canvas) return null;
    const rect = this._canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const pointer = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new Raycaster();
    const point = new Vector3();
    this._camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, this._camera);
    return raycaster.ray.intersectPlane(ZOOM_TARGET_PLANE, point);
  }

  private _updatePlasmaColors() {
    if (!this._plasmaMat) return;
    const stops = computePlasmaStops(this._primaryColor, this._secondaryColor);
    const u = this._plasmaMat.uniforms;
    u.uStop0.value = stops[0];
    u.uStop1.value = stops[1];
    u.uStop2.value = stops[2];
    u.uStop3.value = stops[3];
    u.uStop4.value = stops[4];
  }

  private _scheduleUpdate() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._updateMesh(), 60);
  }

  // ── Three.js scene ────────────────────────────────────────────────────────

  private _initScene() {
    const canvas = this._canvas;

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    this._renderer = renderer;

    const scene = new Scene();
    // Background is null so the CSS background shows through (alpha channel enabled)
    this._scene = scene;

    const camera = new PerspectiveCamera(75, 1, 0.1, 10000);
    camera.position.z = 15;
    this._camera = camera;

    // Lights
    scene.add(new AmbientLight(0xffffff, 0.5));
    const dir = new DirectionalLight(0xffffff, 1.0);
    dir.position.set(10, 10, 10);
    scene.add(dir);
    const p1 = new PointLight(0xff00ff, 1.0);
    p1.position.set(-8, 5, 8);
    scene.add(p1);
    const p2 = new PointLight(0x00ffff, 0.8);
    p2.position.set(8, -5, 8);
    scene.add(p2);

    const plasmaEquirect = this._setupPlasmaEnvMap();
    this._updatePlasma(0);
    this._pmremGenerator = new PMREMGenerator(renderer);
    this._pmremGenerator.compileEquirectangularShader();
    this._pmremRt = this._pmremGenerator.fromEquirectangular(plasmaEquirect);
    this._envMap = this._pmremRt.texture;
    scene.environment = this._envMap;

    // Resize
    this._resizeOb = new ResizeObserver(() => this._resize());
    this._resizeOb.observe(this);
    this._resize();

    this._updateMesh();
    this._loop();
  }

  private _resize() {
    const w = this.offsetWidth || 800;
    const h = this.offsetHeight || 400;
    // setPixelRatio must come first so setSize uses the correct ratio for canvas.width/height
    this._renderer?.setPixelRatio(window.devicePixelRatio);
    this._renderer?.setSize(w, h, false);
    if (this._camera) {
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    }
  }

  private _applyAutoSize() {
    if (!this._textBoundingSize || !this._autoSize) return;
    const angleRad = this._cfg.rotateZ * (Math.PI / 180);
    const cos = Math.abs(Math.cos(angleRad));
    const sin = Math.abs(Math.sin(angleRad));
    const bx = this._textBoundingSize.x;
    const by = this._textBoundingSize.y;
    // Axis-aligned bounding box of the rotated text rectangle
    const rotW = bx * cos + by * sin;
    const rotH = bx * sin + by * cos;
    const newH = this._cfg.fontSize * (rotH / Math.max(by, 0.001));
    const newW = this._cfg.fontSize * (rotW / Math.max(by, 0.001));
    if (Math.abs(this.offsetHeight - newH) > 0.5) this.style.height = `${newH}px`;
    if (Math.abs(this.offsetWidth  - newW) > 0.5) this.style.width  = `${newW}px`;
  }

  private _onFontSizeChange() {
    if (!this._autoSize || !this._textBoundingSize) return;
    this._applyAutoSize();
    if (this._camera) {
      const w = this.offsetWidth || 800;
      const h = this.offsetHeight || 400;
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    }
    if (this._textBoundingSize)
      this._fitCameraToTextSize(this._textBoundingSize);
  }

  private _fitCameraToTextSize(size: Vector3) {
    if (!this._camera) return;
    const fovRad = (this._camera.fov * Math.PI) / 180;
    const halfTanFov = Math.tan(fovRad / 2);
    const aspect = this._camera.aspect;
    // Expand size.x/y by the Z rotation so the camera frames the rotated bounding box.
    const angleRad = this._cfg.rotateZ * (Math.PI / 180);
    const cos = Math.abs(Math.cos(angleRad));
    const sin = Math.abs(Math.sin(angleRad));
    const rotW = size.x * cos + size.y * sin;
    const rotH = size.x * sin + size.y * cos;
    // When auto-size is on, aspect === rotW/rotH so both distances are equal;
    // when auto-size is off, max() letterboxes the text inside the fixed canvas.
    const vertDist = rotH / 2 / halfTanFov;
    const horizDist = rotW / 2 / (halfTanFov * aspect);
    // +size.z/2 keeps the front face of the extruded text exactly at vertDist from camera.
    const dist = Math.max(vertDist, horizDist) + size.z / 2;
    this._camera.position.set(0, 0, Math.max(dist, 0.5));
    this._camera.lookAt(0, 0, 0);
    this._camera.updateMatrixWorld(true);
  }

  private async _updateMesh() {
    if (!this._scene || !this._envMap) return;
    const id = ++this._updateId;

    // Apply FOV change (no geometry rebuild needed, but config setter goes through here)
    if (this._camera && this._camera.fov !== this._cfg.fov) {
      this._camera.fov = this._cfg.fov;
      this._camera.updateProjectionMatrix();
    }

    // Sync CSS font-size from config so _applyAutoSize sets canvas dimensions.
    // Guard against MutationObserver re-entry by only writing when value differs.
    const targetFontSize = `${this._cfg.fontSize}px`;
    if (this.style.fontSize !== targetFontSize) {
      this.style.fontSize = targetFontSize;
    }

    try {
      const displayText = this._cfg.capitalize
        ? this._cfg.text.toUpperCase()
        : this._cfg.text;
      const { geometry, material } = await createTextGeometry({
        text: displayText,
        fontFamily: this._cfg.font,
        size: 2, // fixed internal 3D size — visual scale comes from camera/canvas fitting
        height: this._cfg.depth,
        color: new Color(this._cfg.color),
        metalness: this._cfg.metalness,
        roughness: this._cfg.roughness,
        envMap: this._envMap,
        envMapIntensity: this._cfg.envIntensity,
      });

      if (id !== this._updateId) {
        return;
      } // stale

      this._removeMesh();

      // Build a wrapper Group so rotation is always around the text's visual center
      const wrapper = new Group();
      let inner: Mesh | Group;
      if (geometry instanceof Group) {
        inner = geometry;
        inner.traverse((child) => {
          if (child instanceof Mesh) {
            child.material = material;
            child.castShadow = true;
          }
        });
      } else {
        inner = new Mesh(geometry, material);
        (inner as Mesh).castShadow = true;
      }
      wrapper.add(inner);
      this._scene!.add(wrapper);
      this._mesh = wrapper;

      // Center inner content within wrapper so wrapper.rotation spins around text center
      const box = new Box3().setFromObject(wrapper);
      const center = box.getCenter(new Vector3());
      inner.position.sub(center);
      const size = box.getSize(new Vector3());
      this._textBoundingSize = size;

      if (this._autoSize) {
        this._applyAutoSize();
        // Re-read aspect after height change before fitting camera
        if (this._camera) {
          const w = this.offsetWidth || 800;
          const h = this.offsetHeight || 400;
          this._camera.aspect = w / h;
          this._camera.updateProjectionMatrix();
        }
      }
      this._fitCameraToTextSize(size);
    } catch (err) {
      console.error("[threed-text-wc] mesh update failed:", err);
    }
  }

  private _removeMesh() {
    if (!this._mesh || !this._scene) return;
    this._scene.remove(this._mesh);
    this._mesh.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        mats.forEach((m: any) => m?.dispose());
      }
    });
    this._mesh = null;
  }

  private _loop() {
    this._animId = requestAnimationFrame(() => this._loop());
    const time = (performance.now() - this._startTime) / 1000;
    this._updatePlasma(time);
    if (this._mesh) {
      this._mesh.rotation.x = this._rotation.x;
      this._mesh.rotation.y = this._rotation.y;
      this._mesh.rotation.z = this._cfg.rotateZ * (Math.PI / 180);
    }
    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene, this._camera);
    }
  }

  private _setupPlasmaEnvMap(): Texture {
    const SIZE = 256;
    const rt = new WebGLRenderTarget(SIZE, SIZE, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    const initialStops = computePlasmaStops(this._primaryColor, this._secondaryColor);
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uZoom: { value: 8 },
        uStop0: { value: initialStops[0] },
        uStop1: { value: initialStops[1] },
        uStop2: { value: initialStops[2] },
        uStop3: { value: initialStops[3] },
        uStop4: { value: initialStops[4] },
        uStopCount: { value: PLASMA_STOP_COUNT },
      },
      vertexShader: PLASMA_VERT,
      fragmentShader: PLASMA_FRAG,
    });
    const plasmaScene = new Scene();
    plasmaScene.add(new Mesh(new PlaneGeometry(2, 2), mat));
    const plasmaCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._plasmaRt = rt;
    this._plasmaMat = mat;
    this._plasmaScene = plasmaScene;
    this._plasmaCamera = plasmaCamera;
    const tex = rt.texture;
    tex.mapping = EquirectangularReflectionMapping;
    return tex;
  }

  private _updatePlasma(time: number) {
    const { _plasmaRt: rt, _plasmaMat: mat, _plasmaScene: pScene, _plasmaCamera: pCam, _renderer: renderer } = this;
    if (!rt || !mat || !pScene || !pCam || !renderer) return;
    mat.uniforms.uTime.value = time;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(pScene, pCam);
    renderer.setRenderTarget(prev);
    if (this._pmremGenerator && this._pmremRt) {
      this._pmremGenerator.fromEquirectangular(rt.texture, this._pmremRt);
      const canvas = renderer.domElement;
      renderer.setViewport(0, 0, canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
      renderer.setScissorTest(false);
    }
  }

  private _dispose() {
    if (this._animId !== null) cancelAnimationFrame(this._animId);
    this._resizeOb?.disconnect();
    this._styleObserver?.disconnect();
    this._removeMesh();
    this._plasmaRt?.dispose();
    this._plasmaMat?.dispose();
    this._pmremRt?.dispose();
    this._pmremGenerator?.dispose();
    this._renderer?.dispose();
  }
}

// ── Auto-register ─────────────────────────────────────────────────────────────

if (!customElements.get("threed-text")) {
  customElements.define("threed-text", ThreedTextElement);
}
