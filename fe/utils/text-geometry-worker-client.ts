import * as THREE from "three";
import { deserializeNode, type WorkerGeometryOptions, type WorkerResponse } from "./text-geometry-transfer";

// Metro's dev server will bundle *any* entry point on demand via a `.bundle`
// URL, not just the app's registered entry — this fetches a ready-made,
// three.js-inclusive bundle for the worker without needing a separate build
// step (esbuild etc). The `fe/` prefix reflects the pnpm workspace root
// (one level above this app) that Metro resolves module paths against.
// Dev-server only: this doesn't work against a production static export.
const WORKER_BUNDLE_URL =
  "/fe/utils/text-geometry.worker.bundle?platform=web&dev=true&minify=false";

interface PendingRequest {
  resolve: (group: THREE.Group) => void;
  reject: (err: Error) => void;
}

let workerPromise: Promise<Worker> | null = null;
const pending = new Map<number, PendingRequest>();
let nextRequestId = 1;

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
          resolver.resolve(deserializeNode(node!) as THREE.Group);
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

/**
 * Runs text-layout/geometry construction (font loading, TextGeometry
 * generation, bevel-zone classification) off the main thread. Required, not
 * optional: this is synchronous CPU work per slide, otherwise stalling the
 * render loop for the duration of the build. See buildTextGroup for what
 * actually runs inside the worker.
 */
export async function runTextGeometryWorker(
  options: WorkerGeometryOptions,
  customFontUrl?: string,
): Promise<THREE.Group> {
  const worker = await getWorker();
  const id = nextRequestId++;

  return new Promise<THREE.Group>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, customFontUrl, options });
  });
}
