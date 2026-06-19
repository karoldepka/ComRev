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
 *   env-intensity   — env-map intensity, float (default: "1.5")
 *   show-config     — boolean attr; if present the config panel starts open
 *   scroll-zoom     — set to "true" to enable mouse-wheel scroll zoom; pinch-to-zoom always works (default: disabled)
 *   auto-size       — set to "false" to disable; when enabled, element height is computed from text bounding box (default: enabled)
 *   primary-color   — hex color for UI accents + default text color (default: "#ff6600")
 *   secondary-color — hex color for secondary UI accents (default: "#0066ff")
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

const PLASMA_STOP_COUNT = 4;

// Derives plasma gradient stops from primary + secondary colors.
// Layout: black → dark primary (ember) → full primary (flame) → secondary (corona)
function computePlasmaStops(primary: THREE.Color, secondary: THREE.Color): THREE.Vector4[] {
  return [
    new THREE.Vector4(0,    0,              0,              0),
    new THREE.Vector4(0.33, primary.r * 0.35, primary.g * 0.35, primary.b * 0.35),
    new THREE.Vector4(0.66, primary.r,      primary.g,      primary.b),
    new THREE.Vector4(1.0,  secondary.r,    secondary.g,    secondary.b),
    new THREE.Vector4(0,    0,              0,              0), // padding
  ];
}

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
  fov: number;
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
  fov: 75,
};

const ZOOM_TARGET_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

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
    font-family: system-ui, -apple-system, sans-serif;
  }
  canvas {
    display: block;
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100%;
    height: 100%;
  }
  /* ── Config panel ── */
  .cfg-panel {
    position: absolute;
    top: 0; right: 0;
    width: 270px;
    height: 100%;
    background: rgba(10,10,10,0.97);
    border-left: 1px solid rgba(255,255,255,0.09);
    padding: 14px 14px 20px;
    box-sizing: border-box;
    overflow-y: auto;
    z-index: 20;
    transform: translateX(calc(100% + 2px));
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
  .cfg-title { margin: 0; font-size: 14px; color: var(--primary-color, #ff6600); font-weight: 600; }
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
  textarea:focus, select:focus { border-color: var(--primary-color, #ff6600); }
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
    accent-color: var(--primary-color, #ff6600);
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
        <label class="field-label">Extrude</label>
        <div class="range-row">
          <input type="range" id="cfg-depth" min="0.05" max="3" step="0.05" value="${cfg.depth}">
          <span class="range-val" id="cfg-depth-v">${cfg.depth.toFixed(2)}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Perspective (FOV)</label>
        <div class="range-row">
          <input type="range" id="cfg-fov" min="10" max="120" step="1" value="${cfg.fov}">
          <span class="range-val" id="cfg-fov-v">${cfg.fov}°</span>
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

      <div class="field">
        <label class="field-label">Font size</label>
        <div class="range-row">
          <input type="range" id="cfg-font-size" min="20" max="600" step="10" value="120">
          <span class="range-val" id="cfg-font-size-v">120px</span>
        </div>
      </div>

    </div>
  `;
}

// ── Web Component ─────────────────────────────────────────────────────────────

export class ThreedTextElement extends HTMLElement {
  static get observedAttributes() {
    return ['text', 'color', 'font', 'size', 'depth', 'metalness', 'roughness', 'env-intensity', 'fov', 'show-config', 'scroll-zoom', 'primary-color', 'secondary-color', 'auto-size'];
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
  private _scrollZoom = false;
  private _autoSize = true;
  private _textBoundingSize: THREE.Vector3 | null = null;
  private _styleObserver: MutationObserver | null = null;
  private _primaryColor = new THREE.Color('#ff6600');
  private _secondaryColor = new THREE.Color('#0066ff');
  // Plasma env-map
  private _plasmaRt: THREE.WebGLRenderTarget | null = null;
  private _plasmaMat: THREE.ShaderMaterial | null = null;
  private _plasmaScene: THREE.Scene | null = null;
  private _plasmaCamera: THREE.OrthographicCamera | null = null;
  private _pmremGenerator: THREE.PMREMGenerator | null = null;
  private _pmremRt: THREE.WebGLRenderTarget | null = null;

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
      case 'fov':          this._cfg.fov = parseFloat(value); break;
      case 'scroll-zoom':
        this._scrollZoom = value !== 'false';
        return;
      case 'auto-size':
        this._autoSize = value !== 'false';
        if (this._autoSize && this._textBoundingSize) {
          this._applyAutoSize();
          this._fitCameraToTextSize(this._textBoundingSize);
        }
        return;
      case 'primary-color':
        this.style.setProperty('--primary-color', value);
        this._primaryColor.set(value);
        this._updatePlasmaColors();
        if (!this.hasAttribute('color')) {
          this._cfg.color = value;
          this._scheduleUpdate();
        }
        return;
      case 'secondary-color':
        this.style.setProperty('--secondary-color', value);
        this._secondaryColor.set(value);
        this._updatePlasmaColors();
        return;
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

    const openPanel = () => panel.classList.add('open');

    // Right-click opens the config panel instead of the browser context menu
    this._canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openPanel();
    });

    // Long-press (≥500 ms) opens the config panel on touch devices
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    this._canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          openPanel();
        }, 500);
      }
    }, { passive: true });
    const cancelLongPress = () => {
      if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
    };
    this._canvas.addEventListener('touchend',    cancelLongPress, { passive: true });
    this._canvas.addEventListener('touchcancel', cancelLongPress, { passive: true });
    this._canvas.addEventListener('touchmove',   cancelLongPress, { passive: true });

    this._shadow.querySelector('.cfg-close')!.addEventListener('click', () =>
      panel.classList.remove('open')
    );

    this._bindControl('#cfg-text',     'input',  (v) => { this._cfg.text = v; });
    this._bindControl('#cfg-font',     'change', (v) => { this._cfg.font = v; });
    this._bindControl('#cfg-color',    'input',  (v) => { this._cfg.color = v; });
    this._bindRange('#cfg-depth',      '#cfg-depth-v',    (v) => { this._cfg.depth = v; });
    this._bindRange('#cfg-metalness',  '#cfg-metalness-v',(v) => { this._cfg.metalness = v; });
    this._bindRange('#cfg-roughness',  '#cfg-roughness-v',(v) => { this._cfg.roughness = v; });
    this._bindRange('#cfg-env',        '#cfg-env-v',      (v) => { this._cfg.envIntensity = v; });
    const fovSlider = this._shadow.querySelector('#cfg-fov') as HTMLInputElement | null;
    const fovVal    = this._shadow.querySelector('#cfg-fov-v') as HTMLElement | null;
    if (fovSlider) {
      fovSlider.addEventListener('input', () => {
        const v = parseInt(fovSlider.value);
        this._cfg.fov = v;
        if (fovVal) fovVal.textContent = `${v}°`;
        if (this._camera) {
          this._camera.fov = v;
          this._camera.updateProjectionMatrix();
          if (this._textBoundingSize) this._fitCameraToTextSize(this._textBoundingSize);
        }
        this._dispatchChange();
      });
    }

    // Font-size slider — sets CSS font-size, which _applyAutoSize reads
    const fontSizeSlider = this._shadow.querySelector('#cfg-font-size') as HTMLInputElement | null;
    const fontSizeVal    = this._shadow.querySelector('#cfg-font-size-v') as HTMLElement | null;
    if (fontSizeSlider) {
      // Initialise slider to match the computed CSS font-size
      const initial = Math.round(parseFloat(getComputedStyle(this).fontSize) || 120);
      fontSizeSlider.value = String(initial);
      if (fontSizeVal) fontSizeVal.textContent = `${initial}px`;
      fontSizeSlider.addEventListener('input', () => {
        const v = parseInt(fontSizeSlider.value);
        if (fontSizeVal) fontSizeVal.textContent = `${v}px`;
        this.style.fontSize = `${v}px`;
      });
    }

    // Re-apply sizing when font-size changes via inline style or class swap
    this._styleObserver = new MutationObserver(() => this._onFontSizeChange());
    this._styleObserver.observe(this, { attributes: true, attributeFilter: ['style', 'class'] });

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

    // Wheel zoom — ctrlKey=true means trackpad/browser pinch gesture, always allow
    this._canvas.addEventListener('wheel', (e) => {
      const isPinch = e.ctrlKey;
      if (!this._scrollZoom && !isPinch) return;
      e.preventDefault();
      if (!this._camera) return;
      const factor = Math.pow(1.001, e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1));
      this._zoomCameraAtClientPoint(e.clientX, e.clientY, factor);
    }, { passive: false });

    // Touch pinch-to-zoom (always active, independent of scroll-zoom setting)
    let lastPinchDist = 0;
    this._canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    }, { passive: true });
    this._canvas.addEventListener('touchmove', (e) => {
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
    }, { passive: false });
    this._canvas.addEventListener('touchend', () => { lastPinchDist = 0; }, { passive: true });

  }

  private _zoomCameraAtClientPoint(clientX: number, clientY: number, factor: number) {
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

  private _worldPointAtClientPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    if (!this._camera || !this._canvas) return null;
    const rect = this._canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    const point = new THREE.Vector3();
    this._camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, this._camera);
    return raycaster.ray.intersectPlane(ZOOM_TARGET_PLANE, point);
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

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    this._renderer = renderer;

    const scene = new THREE.Scene();
    // Background is null so the CSS background shows through (alpha channel enabled)
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

    // Build plasma render target, warm it up, then bootstrap PMREM
    const plasmaEquirect = this._setupPlasmaEnvMap();
    this._updatePlasma(0); // render one frame so PMREM starts with real data

    this._pmremGenerator = new THREE.PMREMGenerator(renderer);
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
    const fontSizePx = parseFloat(getComputedStyle(this).fontSize) || 16;
    const textAspect = this._textBoundingSize.x / Math.max(this._textBoundingSize.y, 0.001);
    // 1.25× matches the camera padding in _fitCameraToTextSize, so text = fontSizePx tall
    const newH = Math.max(Math.round(fontSizePx * 1.25), 80);
    const newW = Math.round(newH * textAspect);
    if (Math.abs(this.offsetHeight - newH) > 1) this.style.height = `${newH}px`;
    if (Math.abs(this.offsetWidth  - newW) > 1) this.style.width  = `${newW}px`;
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
    if (this._textBoundingSize) this._fitCameraToTextSize(this._textBoundingSize);
  }

  private _fitCameraToTextSize(size: THREE.Vector3) {
    if (!this._camera) return;
    const fovRad = (this._camera.fov * Math.PI) / 180;
    const halfTanFov = Math.tan(fovRad / 2);
    const aspect = this._camera.aspect;
    const vertDist  = (size.y / 2) / halfTanFov;
    const horizDist = (size.x / 2) / (halfTanFov * aspect);
    const dist = Math.max(vertDist, horizDist) * 1.25 + size.z / 2;
    this._camera.position.set(0, 0, Math.max(dist, 2));
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

      // Build a wrapper Group so rotation is always around the text's visual center
      const wrapper = new THREE.Group();
      let inner: THREE.Mesh | THREE.Group;
      if (geometry instanceof THREE.Group) {
        inner = geometry;
        inner.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.castShadow = true;
          }
        });
      } else {
        inner = new THREE.Mesh(geometry, material);
        (inner as THREE.Mesh).castShadow = true;
      }
      wrapper.add(inner);
      this._scene!.add(wrapper);
      this._mesh = wrapper;

      // Center inner content within wrapper so wrapper.rotation spins around text center
      const box = new THREE.Box3().setFromObject(wrapper);
      const center = box.getCenter(new THREE.Vector3());
      inner.position.sub(center);
      const size = box.getSize(new THREE.Vector3());
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

    const initialStops = computePlasmaStops(this._primaryColor, this._secondaryColor);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:      { value: 0 },
        uZoom:      { value: 8 },
        uStop0:     { value: initialStops[0] },
        uStop1:     { value: initialStops[1] },
        uStop2:     { value: initialStops[2] },
        uStop3:     { value: initialStops[3] },
        uStop4:     { value: initialStops[4] },
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

    // Render plasma shader to equirectangular RT
    mat.uniforms.uTime.value = time;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(pScene, pCam);
    renderer.setRenderTarget(prev);

    // Re-generate PMREM cube UV in the pre-allocated target so scene.environment animates.
    // Reusing _pmremRt avoids allocating a new GPU texture every frame.
    if (this._pmremGenerator && this._pmremRt) {
      this._pmremGenerator.fromEquirectangular(rt.texture, this._pmremRt);
      // PMREMGenerator internally sets scissor/viewport; restore to full canvas before main render.
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

if (!customElements.get('threed-text')) {
  customElements.define('threed-text', ThreedTextElement);
}
