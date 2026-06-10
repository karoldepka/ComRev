export type EnvMapStyle =
  | "gradient"
  | "studio"
  | "starfield"
  | "sunset"
  | "neon";
export type MetallicPreset =
  | "gold"
  | "chrome"
  | "copper"
  | "holographic"
  | "obsidian";

export type EffectType =
  | "bloom"
  | "depthOfField"
  | "chromatic"
  | "filmGrain"
  | "glitch"
  | "fishEye"
  | "bend"
  | "envMap"
  | "neonGlow"
  | "metallicPreset"
  | "dust"
  | "wireframe"
  | "outline"
  | "rays"
  | "radialBlur";

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface ThreeDConfig {
  id: string;
  name: string;
  savedAt: string;
  updatedAt: string;
  text: string;
  equalizeLineWidths: boolean;
  equalizationMethod: "spacing" | "fontSize";
  targetWidth: number;
  lineSpacing: number;
  rays: boolean;
  rayMode: "radial" | "spaghetti" | "chip";
  rayCount: number;
  rayThickness: number;
  rayInnerMargin: number;
  rayOuterMargin: number;
  effectInstances: EffectInstance[];
  showAdvanced: boolean;
  synced?: boolean;
  lastSyncAt?: string | null;
  backendId?: string | null;
  syncError?: string | null;
}

const DB_NAME = "ComRevConfigDB";
const DB_VERSION = 1;
const STORE_CONFIGS = "configs";
const STORE_PENDING = "pendingSync";
const STORE_PRESETS = "presets";

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

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
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
    };
  });
}

export interface PresetRecord {
  id: string;
  name: string;
  createdAt: string;
  effects: EffectInstance[];
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
