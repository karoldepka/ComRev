import * as THREE from "three";
import { deserializeNode, type SerializedNode, type WorkerGeometryOptions, type WorkerResponse } from "./text-geometry-transfer";

// Metro's dev server will bundle *any* entry point on demand via a `.bundle`
// URL, not just the app's registered entry — this fetches a ready-made,
// three.js-inclusive bundle for the worker without needing a separate build
// step (esbuild etc). The `fe/` prefix reflects the pnpm workspace root
// (one level above this app) that Metro resolves module paths against.
// Dev-server only: this doesn't work against a production static export.
const WORKER_BUNDLE_URL =
  "/fe/utils/text-geometry.worker.bundle?platform=web&dev=true&minify=false";

interface PendingRequest {
  resolve: (node: SerializedNode) => void;
  reject: (err: Error) => void;
}

let workerPromise: Promise<Worker> | null = null;
const pending = new Map<number, PendingRequest>();
let nextRequestId = 1;

// Caches the raw (still-serialized) worker response per options+font, so a
// slide whose geometry was prefetched while the previous slide was showing
// resolves instantly instead of round-tripping the worker again. Deserialize
// fresh per call (see requestNode callers) rather than caching a THREE.Group
// directly — a Group is a mutable Object3D that gets added to the scene and
// repositioned by its consumer, so two consumers can't safely share one.
const geometryCache = new Map<string, Promise<SerializedNode>>();

function cacheKey(options: WorkerGeometryOptions, customFontUrl?: string): string {
  return JSON.stringify([options, customFontUrl ?? null]);
}

function rejectAllPending(message: string) {
  for (const [id, resolver] of pending) {
    resolver.reject(new Error(message));
    pending.delete(id);
  }
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const res = await fetch(WORKER_BUNDLE_URL);
      if (!res.ok) {
        throw new Error(`Failed to fetch text-geometry worker bundle: HTTP ${res.status}`);
      }
      const code = await res.text();
      const blob = new Blob([code], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl);

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, node, error } = event.data;
        const resolver = pending.get(id);
        if (!resolver) return;
        pending.delete(id);
        if (error) {
          resolver.reject(new Error(error));
        } else {
          resolver.resolve(node!);
        }
      };
      worker.onerror = (err: ErrorEvent) => {
        console.error("[text-geometry worker] fatal error:", err.message || err);
        rejectAllPending(err.message || "Text geometry worker error");
        // Force the next call to spin up a fresh worker instead of retrying
        // against one that's already crashed.
        workerPromise = null;
      };
      return worker;
    })();
  }
  return workerPromise;
}

/** Sends one request to the worker and returns its raw (still-serialized)
 * response — shared by both the cache-miss path and prefetchTextGeometry. */
async function requestNode(options: WorkerGeometryOptions, customFontUrl?: string): Promise<SerializedNode> {
  const worker = await getWorker();
  const id = nextRequestId++;
  return new Promise<SerializedNode>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, customFontUrl, options });
  });
}

function getOrCreateCached(options: WorkerGeometryOptions, customFontUrl?: string): Promise<SerializedNode> {
  const key = cacheKey(options, customFontUrl);
  let nodePromise = geometryCache.get(key);
  if (!nodePromise) {
    nodePromise = requestNode(options, customFontUrl);
    geometryCache.set(key, nodePromise);
    // Don't let a failed request poison the cache — the next call (prefetch
    // or real) should get a fresh attempt instead of the same rejection.
    nodePromise.catch(() => geometryCache.delete(key));
  }
  return nodePromise;
}

/**
 * Runs text-layout/geometry construction (font loading, TextGeometry
 * generation, bevel-zone classification) off the main thread. Required, not
 * optional: this is synchronous CPU work per slide, otherwise stalling the
 * render loop for the duration of the build. See buildTextGroup for what
 * actually runs inside the worker.
 *
 * Transparently reuses a matching in-flight or already-resolved prefetch
 * (see prefetchTextGeometry) — the fresh THREE.Group is always deserialized
 * per call, so this and any other caller (including a concurrent prefetch)
 * never share the same mutable Object3D.
 */
export async function runTextGeometryWorker(
  options: WorkerGeometryOptions,
  customFontUrl?: string,
): Promise<THREE.Group> {
  const node = await getOrCreateCached(options, customFontUrl);
  return deserializeNode(node) as THREE.Group;
}

/**
 * Kicks off building this geometry in the worker ahead of time, without
 * waiting for the result — call this for the *next* slide as soon as the
 * *current* one starts showing, so by the time runTextGeometryWorker() is
 * actually called for it (on transition), the worker has already finished
 * (or is already in flight) instead of starting cold. Errors are swallowed
 * here; the eventual real runTextGeometryWorker() call will surface them.
 */
export function prefetchTextGeometry(options: WorkerGeometryOptions, customFontUrl?: string): void {
  getOrCreateCached(options, customFontUrl).catch(() => {
    // Swallowed: the next real runTextGeometryWorker() call for these same
    // options will retry (see getOrCreateCached's cache eviction on failure)
    // and surface the error there instead.
  });
}
