/**
 * <threed-text> — self-contained 3D text Web Component.
 *
 * Attributes (all optional, all updatable at runtime):
 *   text          — display text; use \n for line breaks (default: "Hello\nWorld")
 *   color         — hex color e.g. "#ff6600" (default: "#ff6600")
 *   font          — font id from AVAILABLE_FONTS (default: "droid_sans")
 *   size          — text size, float (default: "2")
 *   depth         — extrusion depth, float (default: "0.8")
 *   metalness     — 0–1 (default: "0.95")
 *   roughness     — 0–1 (default: "0.15")
 *   env-intensity — env-map intensity, float (default: "1.5")
 *   show-config   — boolean attr; if present the config panel starts open
 *
 * Events:
 *   config-change — CustomEvent<ThreedTextConfig>; fired on every config change
 *
 * Properties:
 *   config        — get/set the full config object at once
 */

import * as THREE from 'three';
import {
  createTextGeometry,
  AVAILABLE_FONTS,
  DEFAULT_3D_FONT_FAMILY,
} from '../../utils/three-text-geometry';

// ── Animated plasma env-map shader ───────────────────────────────────────────

const PLASMA_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

// Fire color stops: [t, r, g, b] — matches the main app "fire" plasma scheme
const PLASMA_STOPS = [
  new THREE.Vector4(0,    0,    0,    0),     // black
  new THREE.Vector4(0.33, 0.86, 0,    0),     // dark red
  new THREE.Vector4(0.66, 1,    0.65, 0),     // orange
  new THREE.Vector4(1,    1,    1,    0.78),  // bright yellow-white
  new THREE.Vector4(0,    0,    0,    0),     // unused padding (shader reads uStopCount)
];
const PLASMA_STOP_COUNT = 4;

const PLASMA_FRAG = /* glsl */`
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

export interface ThreedTextConfig {
  text: string;
  color: string;
  font: string;
  size: number;
  depth: number;
  metalness: number;
  roughness: number;
  envIntensity: number;
}

const DEFAULTS: ThreedTextConfig = {
  text: 'Hello\nWorld',
  color: '#ff6600',
  font: DEFAULT_3D_FONT_FAMILY,
  size: 2,
  depth: 0.8,
  metalness: 0.95,
  roughness: 0.15,
  envIntensity: 1.5,
};

// ── Styles (shadow DOM) ───────────────────────────────────────────────────────

const STYLES = `
  :host {
    display: block;
    position: relative;
    width: 100%;
    height: 400px;
    background: #1a1a1a;
    border-radius: 5px;
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* ── Config button ── */
  .cfg-btn {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: rgba(0,0,0,0.55);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 6px;
    padding: 6px 13px;
    cursor: pointer;
    font-size: 13px;
    backdrop-filter: blur(6px);
    z-index: 10;
    transition: background 0.15s;
    user-select: none;
  }
  .cfg-btn:hover { background: rgba(255,102,0,0.75); }

  /* ── Config panel ── */
  .cfg-panel {
    position: absolute;
    top: 0; right: 0;
    width: 270px;
    height: 100%;
    background: rgba(14,14,14,0.93);
    backdrop-filter: blur(10px);
    border-left: 1px solid rgba(255,255,255,0.09);
    padding: 14px 14px 20px;
    box-sizing: border-box;
    overflow-y: auto;
    z-index: 20;
    transform: translateX(100%);
    transition: transform 0.22s ease;
    color: #e0e0e0;
    font-size: 13px;
  }
  .cfg-panel.open { transform: translateX(0); }

  .cfg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .cfg-title { margin: 0; font-size: 14px; color: #ff6600; font-weight: 600; }
  .cfg-close {
    background: none; border: none;
    color: #aaa; font-size: 18px;
    cursor: pointer; padding: 0; line-height: 1;
  }
  .cfg-close:hover { color: #fff; }

  /* ── Form controls ── */
  .field { margin-bottom: 13px; }
  .field-label {
    display: block;
    margin-bottom: 4px;
    color: #999;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  textarea, select, input[type="color"] {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    color: #e0e0e0;
    padding: 6px 8px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  textarea:focus, select:focus { border-color: rgba(255,102,0,0.6); }
  textarea { resize: vertical; min-height: 72px; }
  select option { background: #1a1a1a; }

  input[type="color"] {
    height: 34px;
    padding: 2px 4px;
    cursor: pointer;
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  input[type="range"] {
    flex: 1;
    accent-color: #ff6600;
    cursor: pointer;
  }
  .range-val {
    min-width: 36px;
    text-align: right;
    font-size: 12px;
    color: #aaa;
    font-variant-numeric: tabular-nums;
  }
`;

// ── HTML template ─────────────────────────────────────────────────────────────

function buildTemplate(cfg: ThreedTextConfig, fonts: typeof AVAILABLE_FONTS): string {
  // Only include CDN-backed fonts (inter/roboto are local-only in the main app)
  const fontOptions = fonts
    .filter(f => f.urls.length > 0)
    .map(f => `<option value="${f.id}"${f.id === cfg.font ? ' selected' : ''}>${f.label}</option>`)
    .join('');

  return `
    <canvas></canvas>
    <button class="cfg-btn" type="button">⚙ Configure</button>
    <div class="cfg-panel">
      <div class="cfg-header">
        <h3 class="cfg-title">3D Text Config</h3>
        <button class="cfg-close" type="button" title="Close">✕</button>
      </div>

      <div class="field">
        <label class="field-label" for="cfg-text">Text</label>
        <textarea id="cfg-text" rows="3">${cfg.text.replace(/\n/g, '&#10;')}</textarea>
      </div>

      <div class="field">
        <label class="field-label" for="cfg-font">Font</label>
        <select id="cfg-font">${fontOptions}</select>
      </div>

      <div class="field">
        <label class="field-label" for="cfg-color">Color</label>
        <input type="color" id="cfg-color" value="${cfg.color}">
      </div>

      <div class="field">
        <label class="field-label">Size</label>
        <div class="range-row">
          <input type="range" id="cfg-size" min="0.5" max="6" step="0.1" value="${cfg.size}">
          <span class="range-val" id="cfg-size-v">${cfg.size.toFixed(1)}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Depth</label>
        <div class="range-row">
          <input type="range" id="cfg-depth" min="0.05" max="3" step="0.05" value="${cfg.depth}">
          <span class="range-val" id="cfg-depth-v">${cfg.depth.toFixed(2)}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Metalness</label>
        <div class="range-row">
          <input type="range" id="cfg-metalness" min="0" max="1" step="0.01" value="${cfg.metalness}">
          <span class="range-val" id="cfg-metalness-v">${cfg.metalness.toFixed(2)}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Roughness</label>
        <div class="range-row">
          <input type="range" id="cfg-roughness" min="0" max="1" step="0.01" value="${cfg.roughness}">
          <span class="range-val" id="cfg-roughness-v">${cfg.roughness.toFixed(2)}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Env-map intensity</label>
        <div class="range-row">
          <input type="range" id="cfg-env" min="0" max="4" step="0.05" value="${cfg.envIntensity}">
          <span class="range-val" id="cfg-env-v">${cfg.envIntensity.toFixed(2)}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Web Component ─────────────────────────────────────────────────────────────

export class ThreedTextElement extends HTMLElement {
  static get observedAttributes() {
    return ['text', 'color', 'font', 'size', 'depth', 'metalness', 'roughness', 'env-intensity', 'show-config'];
  }

  private _cfg: ThreedTextConfig = { ...DEFAULTS };
  private _shadow!: ShadowRoot;
  private _canvas!: HTMLCanvasElement;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.PerspectiveCamera | null = null;
  private _mesh: THREE.Mesh | THREE.Group | null = null;
  private _envMap: THREE.Texture | null = null;
  private _animId: number | null = null;
  private _resizeOb: ResizeObserver | null = null;
  private _updateId = 0;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _rotation = { x: 0, y: 0 };
  private _drag = false;
  private _lastMouse = { x: 0, y: 0 };
  private _startTime = performance.now();
  // Plasma env-map
  private _plasmaRt: THREE.WebGLRenderTarget | null = null;
  private _plasmaMat: THREE.ShaderMaterial | null = null;
  private _plasmaScene: THREE.Scene | null = null;
  private _plasmaCamera: THREE.OrthographicCamera | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._buildDOM();
    this._initScene();
  }

  disconnectedCallback() {
    this._dispose();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (value === null) return;
    switch (name) {
      case 'text':         this._cfg.text = value.replace(/\\n/g, '\n'); break;
      case 'color':        this._cfg.color = value; break;
      case 'font':         this._cfg.font = value; break;
      case 'size':         this._cfg.size = parseFloat(value); break;
      case 'depth':        this._cfg.depth = parseFloat(value); break;
      case 'metalness':    this._cfg.metalness = parseFloat(value); break;
      case 'roughness':    this._cfg.roughness = parseFloat(value); break;
      case 'env-intensity':this._cfg.envIntensity = parseFloat(value); break;
      case 'show-config':
        this._shadow?.querySelector('.cfg-panel')?.classList.toggle('open', value !== 'false');
        return;
    }
    this._scheduleUpdate();
  }

  // ── Public property ────────────────────────────────────────────────────────

  get config(): ThreedTextConfig { return { ...this._cfg }; }
  set config(value: Partial<ThreedTextConfig>) {
    Object.assign(this._cfg, value);
    this._scheduleUpdate();
  }

  // ── DOM build ─────────────────────────────────────────────────────────────

  private _buildDOM() {
    const style = document.createElement('style');
    style.textContent = STYLES;

    const tpl = document.createElement('div');
    tpl.innerHTML = buildTemplate(this._cfg, AVAILABLE_FONTS);

    this._shadow.appendChild(style);
    while (tpl.firstChild) this._shadow.appendChild(tpl.firstChild);

    this._canvas = this._shadow.querySelector('canvas')!;

    const panel = this._shadow.querySelector('.cfg-panel') as HTMLElement;
    const showConfig = this.hasAttribute('show-config') && this.getAttribute('show-config') !== 'false';
    if (showConfig) panel.classList.add('open');

    this._shadow.querySelector('.cfg-btn')!.addEventListener('click', () =>
      panel.classList.toggle('open')
    );
    this._shadow.querySelector('.cfg-close')!.addEventListener('click', () =>
      panel.classList.remove('open')
    );

    this._bindControl('#cfg-text',     'input',  (v) => { this._cfg.text = v; });
    this._bindControl('#cfg-font',     'change', (v) => { this._cfg.font = v; });
    this._bindControl('#cfg-color',    'input',  (v) => { this._cfg.color = v; });
    this._bindRange('#cfg-size',       '#cfg-size-v',     (v) => { this._cfg.size = v; });
    this._bindRange('#cfg-depth',      '#cfg-depth-v',    (v) => { this._cfg.depth = v; });
    this._bindRange('#cfg-metalness',  '#cfg-metalness-v',(v) => { this._cfg.metalness = v; });
    this._bindRange('#cfg-roughness',  '#cfg-roughness-v',(v) => { this._cfg.roughness = v; });
    this._bindRange('#cfg-env',        '#cfg-env-v',      (v) => { this._cfg.envIntensity = v; });

    this._canvas.addEventListener('mousedown', (e) => {
      this._drag = true;
      this._lastMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mousemove', (e) => {
      if (!this._drag) return;
      this._rotation.y += (e.clientX - this._lastMouse.x) * 0.01;
      this._rotation.x += (e.clientY - this._lastMouse.y) * 0.01;
      this._lastMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => { this._drag = false; });

    // Wheel zoom
    this._canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this._camera) return;
      const factor = Math.pow(1.001, e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1));
      this._camera.position.z = Math.max(2, Math.min(80, this._camera.position.z * factor));
    }, { passive: false });
  }

  // ── Control wiring ────────────────────────────────────────────────────────

  private _bindControl(selector: string, event: string, setter: (v: string) => void) {
    const el = this._shadow.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el) return;
    el.addEventListener(event, () => {
      setter((el as HTMLInputElement).value);
      this._scheduleUpdate();
      this._dispatchChange();
    });
  }

  private _bindRange(selector: string, valSelector: string, setter: (v: number) => void) {
    const el  = this._shadow.querySelector(selector) as HTMLInputElement | null;
    const val = this._shadow.querySelector(valSelector) as HTMLElement | null;
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      setter(v);
      if (val) val.textContent = v.toFixed(el.step.includes('.0') ? 1 : 2);
      this._scheduleUpdate();
      this._dispatchChange();
    });
  }

  private _scheduleUpdate() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._updateMesh(), 60);
  }

  private _dispatchChange() {
    this.dispatchEvent(new CustomEvent<ThreedTextConfig>('config-change', {
      detail: { ...this._cfg },
      bubbles: true,
      composed: true,
    }));
  }

  // ── Three.js scene ────────────────────────────────────────────────────────

  private _initScene() {
    const canvas = this._canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    this._renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10000);
    camera.position.z = 15;
    this._camera = camera;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(10, 10, 10);
    scene.add(dir);
    const p1 = new THREE.PointLight(0xff00ff, 1.0);
    p1.position.set(-8, 5, 8);
    scene.add(p1);
    const p2 = new THREE.PointLight(0x00ffff, 0.8);
    p2.position.set(8, -5, 8);
    scene.add(p2);

    this._envMap = this._setupPlasmaEnvMap();
    if (this._envMap) scene.environment = this._envMap;

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
    this._renderer?.setSize(w, h, false);
    this._renderer?.setPixelRatio(window.devicePixelRatio);
    if (this._camera) {
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    }
  }

  private async _updateMesh() {
    if (!this._scene || !this._envMap) return;
    const id = ++this._updateId;

    try {
      const { geometry, material } = await createTextGeometry({
        text: this._cfg.text,
        fontFamily: this._cfg.font,
        size: this._cfg.size,
        height: this._cfg.depth,
        color: new THREE.Color(this._cfg.color),
        metalness: this._cfg.metalness,
        roughness: this._cfg.roughness,
        envMap: this._envMap,
        envMapIntensity: this._cfg.envIntensity,
      });

      if (id !== this._updateId) { return; } // stale

      this._removeMesh();
      let mesh: THREE.Mesh | THREE.Group;
      if (geometry instanceof THREE.Group) {
        mesh = geometry;
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.castShadow = true;
          }
        });
      } else {
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
      }
      this._scene!.add(mesh);
      this._mesh = mesh;
    } catch (err) {
      console.error('[threed-text-wc] mesh update failed:', err);
    }
  }

  private _removeMesh() {
    if (!this._mesh || !this._scene) return;
    this._scene.remove(this._mesh);
    this._mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
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
    }
    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene, this._camera);
    }
  }

  // ── Animated plasma env-map ────────────────────────────────────────────────

  private _setupPlasmaEnvMap(): THREE.Texture {
    const SIZE = 256;
    const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:      { value: 0 },
        uZoom:      { value: 8 },
        uStop0:     { value: PLASMA_STOPS[0] },
        uStop1:     { value: PLASMA_STOPS[1] },
        uStop2:     { value: PLASMA_STOPS[2] },
        uStop3:     { value: PLASMA_STOPS[3] },
        uStop4:     { value: PLASMA_STOPS[4] },
        uStopCount: { value: PLASMA_STOP_COUNT },
      },
      vertexShader:   PLASMA_VERT,
      fragmentShader: PLASMA_FRAG,
    });

    const plasmaScene = new THREE.Scene();
    plasmaScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    const plasmaCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._plasmaRt     = rt;
    this._plasmaMat    = mat;
    this._plasmaScene  = plasmaScene;
    this._plasmaCamera = plasmaCamera;

    const tex = rt.texture;
    tex.mapping = THREE.EquirectangularReflectionMapping;
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
  }

  private _dispose() {
    if (this._animId !== null) cancelAnimationFrame(this._animId);
    this._resizeOb?.disconnect();
    this._removeMesh();
    this._plasmaRt?.dispose();
    this._plasmaMat?.dispose();
    this._renderer?.dispose();
  }
}

// ── Auto-register ─────────────────────────────────────────────────────────────

if (!customElements.get('threed-text')) {
  customElements.define('threed-text', ThreedTextElement);
}
