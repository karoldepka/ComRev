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

/**
 * A pool of workers (rather than one shared worker) so independent slides'
 * geometry actually builds in parallel across CPU cores, instead of being
 * serialized one request at a time behind a single worker's message queue —
 * that serialization was the real reason a deep prefetch lookahead still
 * didn't stop a slow build from delaying whatever slide needed it next.
 */
const POOL_SIZE = typeof navigator !== "undefined" && navigator.hardwareConcurrency
  ? Math.max(2, Math.min(4, navigator.hardwareConcurrency - 1))
  : 2;

interface PoolWorker {
  worker: Worker;
  pending: number;
}

let poolPromise: Promise<PoolWorker[]> | null = null;
const pendingRequests = new Map<number, PendingRequest>();
let nextRequestId = 1;

// Caches the raw (still-serialized) worker response per options+font, so a
// slide whose geometry was prefetched while an earlier slide was showing
// resolves instantly instead of round-tripping the worker again. Deserialize
// fresh per call (see requestNode callers) rather than caching a THREE.Group
// directly — a Group is a mutable Object3D that gets added to the scene and
// repositioned by its consumer, so two consumers can't safely share one.
const geometryCache = new Map<string, Promise<SerializedNode>>();

function cacheKey(options: WorkerGeometryOptions, customFontUrl?: string): string {
  return JSON.stringify([options, customFontUrl ?? null]);
}

// Per-mesh and running-total build-time logging (see precomputeAllSlideGeometry
// in app/(tabs)/three-d.tsx, which is what actually triggers building a whole
// sequence's worth of slides up front) — visibility into how much of a
// slide's on-screen time is genuinely spent waiting on geometry construction
// versus its own configured display duration.
let totalBuildTimeMs = 0;
let buildCount = 0;

function logBuildTiming(options: WorkerGeometryOptions, ms: number) {
  totalBuildTimeMs += ms;
  buildCount++;
  const label = options.text.replace(/\n/g, " / ").slice(0, 40);
  // eslint-disable-next-line no-console
  console.log(
    `[text-geometry] built "${label}" in ${ms.toFixed(0)}ms` +
    ` (total: ${totalBuildTimeMs.toFixed(0)}ms across ${buildCount} build${buildCount === 1 ? "" : "s"})`,
  );
}

async function createPoolWorker(): Promise<PoolWorker> {
  const res = await fetch(WORKER_BUNDLE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch text-geometry worker bundle: HTTP ${res.status}`);
  }
  const code = await res.text();
  const blob = new Blob([code], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl);
  const entry: PoolWorker = { worker, pending: 0 };

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const { id, node, error } = event.data;
    const resolver = pendingRequests.get(id);
    if (!resolver) return;
    pendingRequests.delete(id);
    entry.pending = Math.max(0, entry.pending - 1);
    if (error) {
      resolver.reject(new Error(error));
    } else {
      resolver.resolve(node!);
    }
  };
  worker.onerror = (err: ErrorEvent) => {
    console.error("[text-geometry worker] fatal error:", err.message || err);
    // A crashed worker's own in-flight requests will simply never resolve —
    // rare enough (and each request has no inherent timeout today) that
    // reconstructing the pool mid-flight isn't worth the complexity here.
    entry.pending = 0;
  };
  return entry;
}

async function getPool(): Promise<PoolWorker[]> {
  if (!poolPromise) {
    poolPromise = Promise.all(
      Array.from({ length: POOL_SIZE }, () => createPoolWorker()),
    );
  }
  return poolPromise;
}

/** Picks whichever pool worker currently has the fewest requests in flight —
 * simple least-loaded dispatch, good enough for a handful of workers. */
async function pickWorker(): Promise<PoolWorker> {
  const pool = await getPool();
  return pool.reduce((least, w) => (w.pending < least.pending ? w : least), pool[0]);
}

/** Sends one request to a pool worker and returns its raw (still-serialized)
 * response — shared by both the cache-miss path and prefetchTextGeometry. */
async function requestNode(options: WorkerGeometryOptions, customFontUrl?: string): Promise<SerializedNode> {
  const entry = await pickWorker();
  const id = nextRequestId++;
  entry.pending++;
  const startedAt = performance.now();
  return new Promise<SerializedNode>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (node) => {
        logBuildTiming(options, performance.now() - startedAt);
        resolve(node);
      },
      reject,
    });
    entry.worker.postMessage({ id, customFontUrl, options });
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
 * Kicks off building this geometry in the worker pool ahead of time. Call
 * this for any slide whose geometry might be needed soon, so by the time
 * runTextGeometryWorker() is actually called for it (on transition), the
 * pool has already finished (or is already in flight) instead of starting
 * cold. Errors are swallowed (resolves anyway) — the eventual real
 * runTextGeometryWorker() call will surface them instead. Returns a promise
 * that settles once this one build is done, purely so a caller batching many
 * prefetches (see precomputeAllSlideGeometry in app/(tabs)/three-d.tsx) can
 * await the whole batch; fire-and-forget callers can just ignore it.
 */
export function prefetchTextGeometry(options: WorkerGeometryOptions, customFontUrl?: string): Promise<void> {
  return getOrCreateCached(options, customFontUrl).then(
    () => undefined,
    () => undefined, // swallowed: see runTextGeometryWorker for the real error surface
  );
}
