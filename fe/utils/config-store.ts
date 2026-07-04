export type EnvMapStyle =
  | "gradient"
  | "studio"
  | "starfield"
  | "sunset"
  | "neon"
  | "custom";
export type MetallicPreset =
  | "gold"
  | "chrome"
  | "copper"
  | "holographic"
  | "obsidian";

export type EffectType =
  // post-process
  | "bloom" | "depthOfField" | "chromatic" | "filmGrain" | "glitch"
  | "vignette" | "scanlines" | "colorGrading" | "pixelate" | "radialBlur"
  | "circularBlur" | "sepia" | "invert" | "sobelEdge" | "thermal"
  | "nightVision" | "duotone" | "posterize" | "colorOverlay" | "halftone"
  | "sharpen" | "animChromatic" | "blur" | "lensDistort" | "mosaic"
  | "noisePost" | "crtCurvature" | "vhsTracking" | "glowEdge" | "acid"
  | "kaleidoscopePost" | "oldFilm" | "zoomBlur" | "crosshatch" | "glitchBlock"
  | "speedLines" | "rgbShift" | "frostedGlass" | "waterRipple" | "pixelShift"
  | "retroTv" | "antialiasing"
  // vertex deform
  | "fishEye" | "bend" | "wave" | "twist" | "inflate" | "taper" | "shear"
  | "spherify" | "ripple" | "melt" | "pinch" | "voxelize" | "crumple"
  | "noiseWobble" | "spiralDeform" | "bulge" | "squish" | "zap" | "explode"
  | "fold" | "spikes" | "cylindrize"
  // material
  | "envMap" | "neonGlow" | "metallicPreset" | "xRay" | "toonShading"
  | "hologram" | "gradientMesh" | "rainbowMesh" | "iridescent"
  | "emissivePulse" | "dissolveAnim" | "glass" | "matcap"
  // lighting
  | "spotlight" | "strobe" | "flicker" | "colorCycleLight" | "disco"
  | "ambientPulse" | "rimLight" | "dramaticLight" | "lightningFlash" | "rainbowLights"
  // scene objects
  | "dust" | "wireframe" | "outline" | "echoCopies" | "rays"
  | "floatingRings" | "starField3d" | "snow" | "rain" | "confetti"
  | "sparkle" | "aura" | "gridFloor" | "orbiter" | "portalRing"
  | "cometTrail" | "floatingCubes" | "mirrorPlane"
  // animation
  | "pulse" | "spin" | "bounce" | "levitation" | "swing" | "tremble"
  | "breathe" | "wiggle" | "floatDrift" | "flipCoin" | "grow" | "shrink"
  | "orbitAnim" | "rock" | "jitter" | "sway" | "figureEight" | "pendulum"
  // ai-generated
  | "customJs"
  // added effects
  | "mainText" | "text3d" | "graphics" | "wings" | "fire" | "smoke" | "skySphere" | "tessellate" | "fractalBackground"
  // static effects
  | "flatShade" | "shadowFloor" | "backgroundPlane" | "fogEffect"
  | "emboss" | "threshold" | "mirrorH" | "mirrorV" | "sketch"
  | "sunsetLight" | "studioLight" | "moonLight" | "chromeEdge"
  | "colorBurn" | "depthLines";

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  animate: boolean;
  seed?: number;
  params: Record<string, unknown>;
}

export interface ThreeDConfig {
  id: string;
  name: string;
  savedAt: string;
  updatedAt: string;
  /** @deprecated Kept for migration from old saves; canonical source is the mainText effect instance. */
  text?: string;
  /** @deprecated */
  equalizeLineWidths?: boolean;
  /** @deprecated */
  equalizationMethod?: "spacing" | "fontSize";
  /** @deprecated */
  targetWidth?: number;
  /** @deprecated */
  lineSpacing?: number;
  effectInstances: EffectInstance[];
  showAdvanced: boolean;
  synced?: boolean;
  lastSyncAt?: string | null;
  backendId?: string | null;
  syncError?: string | null;
}

const DB_NAME = "ComRevConfigDB";
const DB_VERSION = 6;
const STORE_CONFIGS = "configs";
const STORE_PENDING = "pendingSync";
const STORE_PRESETS = "presets";
const STORE_TRIED_EFFECTS = "triedEffects";
const STORE_SOUNDSCAPE_PRESETS = "soundscapePresets";
const STORE_LAST_SOUNDSCAPE_STATE = "lastSoundscapeState";

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(
      new Error("IndexedDB is not available in this environment."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;

    // A stale connection from another tab (opened before this app instance,
    // holding an older DB_VERSION with no onversionchange handler of its own)
    // can block this open request indefinitely — IndexedDB never times that
    // out on its own. Left unhandled, every read/write silently hangs forever
    // with no error, which looks exactly like settings failing to persist.
    // Fail loudly instead so callers' catch blocks can log it.
    const blockTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          "IndexedDB open timed out — likely blocked by another open tab/window of this app. Close other tabs of this app and retry.",
        ),
      );
    }, 2000);

    request.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(blockTimeout);
      reject(request.error);
    };
    request.onsuccess = () => {
      if (settled) return;
      settled = true;
      clearTimeout(blockTimeout);
      const db = request.result;
      // If another tab/window later needs a higher DB_VERSION, release this
      // connection instead of silently blocking that upgrade forever — openDb()
      // just reopens cleanly next time it's called.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onblocked = () => {
      console.warn(
        "IndexedDB upgrade blocked by another open tab/window of this app; will time out shortly if it doesn't close.",
      );
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CONFIGS)) {
        db.createObjectStore(STORE_CONFIGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PRESETS)) {
        db.createObjectStore(STORE_PRESETS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_TRIED_EFFECTS)) {
        db.createObjectStore(STORE_TRIED_EFFECTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SOUNDSCAPE_PRESETS)) {
        db.createObjectStore(STORE_SOUNDSCAPE_PRESETS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_LAST_SOUNDSCAPE_STATE)) {
        db.createObjectStore(STORE_LAST_SOUNDSCAPE_STATE, { keyPath: "id" });
      }
    };
  });
}

export interface PresetRecord {
  id: string;
  name: string;
  when_created: string;
  when_last_modified: string;
  effects: EffectInstance[];
  thumbnail?: string;
}

export interface SoundscapeLayerState {
  playing: boolean;
  volume: number;
}

export interface SoundscapeBirdsState extends SoundscapeLayerState {
  pitch: number;
  speed: number;
}

/** A saved snapshot of the full soundscape mixer — binaural, noise, ambience and birds layers. */
export interface SoundscapePreset {
  id: string;
  name: string;
  when_created: string;
  when_last_modified: string;
  beatHz: number;
  carrier: number;
  volume: number;
  playing: boolean;
  extraBinaural: Record<string, SoundscapeLayerState>;
  noise: Record<string, SoundscapeLayerState>;
  ambience: Record<string, SoundscapeLayerState>;
  birds: SoundscapeBirdsState;
  /** Optional so presets saved before the stutter gate existed still load fine. */
  stutterGate?: { enabled: boolean; bpm: number };
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await requestPromise(action(store));
  await transactionComplete(tx);
  return result;
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }
  return navigator.onLine;
}

export async function saveConfigLocally(config: ThreeDConfig): Promise<void> {
  await withStore(STORE_CONFIGS, "readwrite", (store) => store.put(config));
}

export async function queuePendingSync(config: ThreeDConfig): Promise<void> {
  await withStore(STORE_PENDING, "readwrite", (store) => store.put(config));
}

export async function getPendingConfigs(): Promise<ThreeDConfig[]> {
  return await withStore(STORE_PENDING, "readonly", (store) => store.getAll());
}

export async function getPendingSyncCount(): Promise<number> {
  const configs = await getPendingConfigs();
  return configs.length;
}

export async function deletePendingSync(id: string): Promise<void> {
  await withStore(STORE_PENDING, "readwrite", (store) => store.delete(id));
}

export async function getLatestConfig(): Promise<ThreeDConfig | null> {
  const configs = await withStore(STORE_CONFIGS, "readonly", (store) =>
    store.getAll(),
  );
  if (configs.length === 0) {
    return null;
  }

  return configs
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 1)[0];
}

export async function savePreset(preset: PresetRecord): Promise<void> {
  await withStore(STORE_PRESETS, "readwrite", (store) => store.put(preset));
}

export async function getPresets(): Promise<PresetRecord[]> {
  return await withStore(STORE_PRESETS, "readonly", (store) => store.getAll());
}

export async function deletePreset(id: string): Promise<void> {
  await withStore(STORE_PRESETS, "readwrite", (store) => store.delete(id));
}

export async function markConfigSynced(
  id: string,
  backendId?: string | null,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONFIGS, "readwrite");
  const store = tx.objectStore(STORE_CONFIGS);
  const request = store.get(id);
  const existing = await requestPromise(request);

  if (existing) {
    existing.synced = true;
    existing.backendId = backendId || null;
    existing.lastSyncAt = new Date().toISOString();
    existing.syncError = null;
    store.put(existing);
  }

  await transactionComplete(tx);
}

export async function syncConfigToBackend(
  apiBase: string,
  config: ThreeDConfig,
): Promise<any> {
  if (!isOnline()) {
    throw new Error("Offline. Cannot sync to backend right now.");
  }

  const response = await fetch(`${apiBase.replace(/\/$/, "")}/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Backend sync failed: ${response.status} ${response.statusText} ${text}`,
    );
  }

  const data = await response.json().catch(() => null);
  await markConfigSynced(config.id, data?.id ?? null);
  await deletePendingSync(config.id);
  return data;
}

export async function saveConfigOfflineFirst(
  config: ThreeDConfig,
  apiBase: string,
): Promise<{ synced: boolean; error?: string }> {
  const record: ThreeDConfig = {
    ...config,
    savedAt: config.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    synced: false,
    syncError: null,
  };

  await saveConfigLocally(record);

  try {
    await syncConfigToBackend(apiBase, record);
    return { synced: true };
  } catch (error: unknown) {
    await queuePendingSync(record);
    return {
      synced: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function syncPendingConfigs(apiBase: string): Promise<void> {
  if (!isOnline()) {
    throw new Error("Offline; cannot sync pending configs.");
  }

  const pending = await getPendingConfigs();
  for (const config of pending) {
    try {
      await syncConfigToBackend(apiBase, config);
    } catch (error) {
      console.warn("Failed to sync pending config", config.id, error);
    }
  }
}

export async function syncPresetToBackend(
  apiBase: string,
  preset: PresetRecord,
): Promise<void> {
  if (!isOnline()) return;
  const base = apiBase.replace(/\/$/, "");
  const response = await fetch(`${base}/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Preset sync failed: ${response.status} ${text}`);
  }
}

export async function loadPresetsFromBackend(
  apiBase: string,
): Promise<PresetRecord[]> {
  const base = apiBase.replace(/\/$/, "");
  const response = await fetch(`${base}/presets`);
  if (!response.ok) throw new Error(`Load presets failed: ${response.status}`);
  return response.json();
}

export async function deletePresetFromBackend(
  apiBase: string,
  id: string,
): Promise<void> {
  if (!isOnline()) return;
  const base = apiBase.replace(/\/$/, "");
  const response = await fetch(`${base}/presets/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Delete preset failed: ${response.status} ${text}`);
  }
}

// ── Soundscape mixer presets ─────────────────────────────────────────────────

export async function saveSoundscapePreset(preset: SoundscapePreset): Promise<void> {
  await withStore(STORE_SOUNDSCAPE_PRESETS, "readwrite", (store) => store.put(preset));
}

export async function getSoundscapePresets(): Promise<SoundscapePreset[]> {
  return await withStore(STORE_SOUNDSCAPE_PRESETS, "readonly", (store) => store.getAll());
}

export async function deleteSoundscapePreset(id: string): Promise<void> {
  await withStore(STORE_SOUNDSCAPE_PRESETS, "readwrite", (store) => store.delete(id));
}

export async function syncSoundscapePresetToBackend(
  apiBase: string,
  preset: SoundscapePreset,
): Promise<void> {
  if (!isOnline()) return;
  const base = apiBase.replace(/\/$/, "");
  const response = await fetch(`${base}/soundscape-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Soundscape preset sync failed: ${response.status} ${text}`);
  }
}

export async function loadSoundscapePresetsFromBackend(
  apiBase: string,
): Promise<SoundscapePreset[]> {
  const base = apiBase.replace(/\/$/, "");
  const response = await fetch(`${base}/soundscape-presets`);
  if (!response.ok) throw new Error(`Load soundscape presets failed: ${response.status}`);
  return response.json();
}

export async function deleteSoundscapePresetFromBackend(
  apiBase: string,
  id: string,
): Promise<void> {
  if (!isOnline()) return;
  const base = apiBase.replace(/\/$/, "");
  const response = await fetch(`${base}/soundscape-presets/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Delete soundscape preset failed: ${response.status} ${text}`);
  }
}

// ── Last-used soundscape mixer state ─────────────────────────────────────────
// Distinct from named presets above: this is the working state of the mixer
// (volumes, layer params, which preset if any is loaded) so reloading the
// soundscape tab restores what the user had rather than resetting to defaults.

const LAST_SOUNDSCAPE_STATE_KEY = "singleton";
const LAST_SOUNDSCAPE_STATE_SCHEMA_VERSION = 1;
const LAST_SOUNDSCAPE_STATE_STORAGE_KEY = `comrev:soundscape:last-state:v${LAST_SOUNDSCAPE_STATE_SCHEMA_VERSION}`;

export interface LastSoundscapeState {
  id: typeof LAST_SOUNDSCAPE_STATE_KEY;
  schemaVersion: typeof LAST_SOUNDSCAPE_STATE_SCHEMA_VERSION;
  masterVolume: number;
  beatHz: number;
  carrier: number;
  volume: number;
  playing: boolean;
  extraBinaural: Record<string, SoundscapeLayerState>;
  noise: Record<string, SoundscapeLayerState>;
  ambience: Record<string, SoundscapeLayerState>;
  birds: SoundscapeBirdsState;
  stutterGate: { enabled: boolean; bpm: number };
  loadedPresetId: string | null;
  loadedPresetName: string | null;
  updatedAt: string;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const key = "__comrev_storage_probe__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return storage;
  } catch {
    return null;
  }
}

function normalizeLastSoundscapeState(value: unknown): LastSoundscapeState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<LastSoundscapeState>;
  return {
    id: LAST_SOUNDSCAPE_STATE_KEY,
    schemaVersion: LAST_SOUNDSCAPE_STATE_SCHEMA_VERSION,
    masterVolume: typeof record.masterVolume === "number" ? record.masterVolume : 1,
    beatHz: typeof record.beatHz === "number" ? record.beatHz : 10,
    carrier: typeof record.carrier === "number" ? record.carrier : 200,
    volume: typeof record.volume === "number" ? record.volume : 0.35,
    playing: typeof record.playing === "boolean" ? record.playing : false,
    extraBinaural: record.extraBinaural ?? {},
    noise: record.noise ?? {},
    ambience: record.ambience ?? {},
    birds: record.birds ?? { playing: false, volume: 0.35, pitch: 1, speed: 1 },
    stutterGate: record.stutterGate ?? { enabled: false, bpm: 120 },
    loadedPresetId: record.loadedPresetId ?? null,
    loadedPresetName: record.loadedPresetName ?? null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

export async function saveLastSoundscapeState(
  state: Omit<LastSoundscapeState, "id" | "schemaVersion" | "updatedAt">,
): Promise<void> {
  const record: LastSoundscapeState = {
    id: LAST_SOUNDSCAPE_STATE_KEY,
    schemaVersion: LAST_SOUNDSCAPE_STATE_SCHEMA_VERSION,
    ...state,
    updatedAt: new Date().toISOString(),
  };

  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.setItem(LAST_SOUNDSCAPE_STATE_STORAGE_KEY, JSON.stringify(record));
      return;
    } catch (error) {
      console.warn("Unable to persist last-used soundscape state to localStorage:", error);
    }
  }

  await withStore(STORE_LAST_SOUNDSCAPE_STATE, "readwrite", (store) => store.put(record));
}

export async function getLastSoundscapeState(): Promise<LastSoundscapeState | null> {
  const storage = getLocalStorage();
  if (storage) {
    const raw = storage.getItem(LAST_SOUNDSCAPE_STATE_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = normalizeLastSoundscapeState(JSON.parse(raw));
        if (parsed) return parsed;
      } catch (error) {
        console.warn("Unable to parse last-used soundscape state from localStorage:", error);
        storage.removeItem(LAST_SOUNDSCAPE_STATE_STORAGE_KEY);
      }
    }
  }

  try {
    const record = await withStore<LastSoundscapeState | undefined>(
      STORE_LAST_SOUNDSCAPE_STATE,
      "readonly",
      (store) => store.get(LAST_SOUNDSCAPE_STATE_KEY),
    );
    const normalized = normalizeLastSoundscapeState(record);
    if (normalized && storage) {
      try {
        storage.setItem(LAST_SOUNDSCAPE_STATE_STORAGE_KEY, JSON.stringify(normalized));
      } catch (error) {
        console.warn("Unable to migrate last-used soundscape state to localStorage:", error);
      }
    }
    return normalized;
  } catch (error) {
    console.warn("Unable to load last-used soundscape state from IndexedDB:", error);
    return null;
  }
}

export async function saveSoundscapePresetOfflineFirst(
  preset: SoundscapePreset,
  apiBase: string,
): Promise<void> {
  await saveSoundscapePreset(preset);
  try {
    await syncSoundscapePresetToBackend(apiBase, preset);
  } catch (error) {
    console.warn("Soundscape preset saved locally; backend sync failed:", error);
  }
}

// ── Tried-effects tracking ────────────────────────────────────────────────────
// Records which EffectType values the user has ever added, locally + backend.
// Used in future "gimme totally new" / novelty suggestions.

const TRIED_EFFECTS_KEY = "singleton";

interface TriedEffectsRecord {
  id: typeof TRIED_EFFECTS_KEY;
  tried: string[]; // EffectType values
  updatedAt: string;
}

async function getTriedEffectsRecord(): Promise<TriedEffectsRecord> {
  try {
    const rec = await withStore<TriedEffectsRecord | undefined>(
      STORE_TRIED_EFFECTS,
      "readonly",
      (store) => store.get(TRIED_EFFECTS_KEY),
    );
    return rec ?? { id: TRIED_EFFECTS_KEY, tried: [], updatedAt: "" };
  } catch {
    return { id: TRIED_EFFECTS_KEY, tried: [], updatedAt: "" };
  }
}

export async function getTriedEffects(): Promise<string[]> {
  return (await getTriedEffectsRecord()).tried;
}

export async function recordTriedEffect(type: EffectType, apiBase: string): Promise<void> {
  try {
    const rec = await getTriedEffectsRecord();
    if (rec.tried.includes(type)) return; // already recorded — nothing to do
    const updated: TriedEffectsRecord = {
      id: TRIED_EFFECTS_KEY,
      tried: [...rec.tried, type],
      updatedAt: new Date().toISOString(),
    };
    await withStore(STORE_TRIED_EFFECTS, "readwrite", (store) => store.put(updated));
    syncTriedEffectsToBackend(apiBase, updated).catch(() => {});
  } catch (error) {
    console.warn("recordTriedEffect failed:", error);
  }
}

async function syncTriedEffectsToBackend(apiBase: string, rec: TriedEffectsRecord): Promise<void> {
  if (!isOnline() || !apiBase) return;
  await fetch(`${apiBase.replace(/\/$/, "")}/tried-effects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tried: rec.tried, updatedAt: rec.updatedAt }),
  });
}

// Cross-tab preset handoff (module-level, survives navigation)
let _pendingPreset: PresetRecord | null = null;
export function setPendingPresetToLoad(p: PresetRecord | null) { _pendingPreset = p; }
export function consumePendingPresetToLoad(): PresetRecord | null {
  const p = _pendingPreset; _pendingPreset = null; return p;
}

export async function savePresetOfflineFirst(
  preset: PresetRecord,
  apiBase: string,
): Promise<void> {
  await savePreset(preset);
  try {
    await syncPresetToBackend(apiBase, preset);
  } catch (error) {
    console.warn("Preset saved locally; backend sync failed:", error);
  }
}
