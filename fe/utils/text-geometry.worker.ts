// Runs off the main thread. Fetched at runtime as a Metro dev-server `.bundle`
// (see text-geometry-worker-client.ts) and instantiated via a Blob URL, since
// Metro's web output isn't an ES module and can't use `new Worker(new URL(...))`.
import { buildTextGroup, registerCustomFontUrl } from "./three-text-geometry";
import { serializeNode, type WorkerGeometryOptions, type WorkerResponse } from "./text-geometry-transfer";

interface IncomingRequest {
  id: number;
  /** Custom font URLs live in the main thread's AVAILABLE_FONTS only — the
   * worker runs in its own realm with its own copy, so re-register here. */
  customFontUrl?: string;
  options: WorkerGeometryOptions;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, customFontUrl, options } = event.data as IncomingRequest;
  try {
    if (customFontUrl) {
      registerCustomFontUrl("Custom font", customFontUrl);
    }
    const group = await buildTextGroup(options);
    const transfer: Transferable[] = [];
    const node = serializeNode(group, transfer);
    const response: WorkerResponse = { id, node };
    (self as unknown as Worker).postMessage(response, transfer);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
};

export {};
