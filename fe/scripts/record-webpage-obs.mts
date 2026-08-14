#!/usr/bin/env node
/**
 * Generic webpage recorder using the OBS WebSocket API.
 *
 * Opens any URL in an OBS Browser Source (real-time capture, any resolution,
 * page audio included via reroute_audio) and records it for a fixed duration.
 * Unlike scripts/record-obs.mjs this is not tied to this app's routes/presets —
 * pass any URL, including third-party pages.
 *
 * Prerequisites:
 *   1. OBS Studio 28+ running, with WebSocket server enabled:
 *        OBS → Tools → WebSocket Server Settings → Enable WebSocket server
 *   2. Node 24+ (runs this .ts file directly, no build step)
 *
 * Usage:
 *   node scripts/record-webpage-obs.ts [--url <url>] [options]
 *
 * Options:
 *   --url <url>            Webpage to open (default: http://localhost:8081/preset/principles/full-window)
 *   --duration <seconds>   Recording duration (default: 10)
 *   --width <px>           Canvas width (default: 1080, shorts portrait)
 *   --height <px>          Canvas height (default: 1920, shorts portrait)
 *   --fps <number>         Frames per second (default: 30)
 *   --wait-ms <ms>         Max time to wait for the page to signal it's ready before
 *                          recording anyway (default: 8000). See "Ready signal" below.
 *   --output <path>        Destination path for finished file
 *                          (default: recordings/<ts>_webpage.mp4)
 *   --ws-url <url>         OBS WebSocket URL (default: ws://localhost:4455)
 *   --ws-password <pass>   OBS WebSocket password (default: empty)
 *   --no-resize            Skip setting OBS canvas/output resolution & fps
 *   --scene <name>         OBS scene name to use (default: WebpageRecorder)
 *   --source <name>        OBS browser source name (default: WebpageBrowser)
 *
 * Ready signal:
 *   This script starts a tiny local HTTP server and appends a `ready-port` query
 *   param to the URL. Pages built by this app (see app/preset/[id]/full-window.tsx)
 *   ping it — via navigator.sendBeacon — the moment the first 3D frame has actually
 *   rendered, so recording starts exactly on cue instead of guessing a wait time.
 *   Third-party URLs that don't know about `ready-port` simply never ping it, and
 *   recording falls back to starting after --wait-ms regardless.
 */

import { copyFileSync, mkdirSync, renameSync, statSync, unlinkSync } from "fs";
import { createServer } from "http";
import { OBSWebSocket } from "obs-websocket-js";
import { dirname } from "path";

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): ArgMap {
  const result: ArgMap = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        result[key] = true;
      } else {
        result[key] = next;
        i++;
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));

const DEFAULT_URL = "http://localhost:8081/preset/principles/full-window";
const url = typeof args.url === "string" ? args.url : DEFAULT_URL;

const width = parseInt((args.width as string) ?? "1080", 10);
const height = parseInt((args.height as string) ?? "1920", 10);
const fps = parseInt((args.fps as string) ?? "30", 10);
const durationSec = parseInt((args.duration as string) ?? "10", 10);
// Generous: it's just a ceiling now (see "Ready signal" above), not a blind delay —
// the real ready ping still wins the race as soon as it arrives, so a high default
// costs nothing on a warm page and only matters as a safety net on a cold one
// (first hit to a not-yet-compiled Metro dev bundle can take several seconds).
const waitMs = parseInt((args["wait-ms"] as string) ?? "8000", 10);
const wsUrl = (args["ws-url"] as string) ?? "ws://localhost:4455";
const wsPassword = (args["ws-password"] as string) ?? "";
const noResize = args["no-resize"] === true;
const sceneName = (args.scene as string) ?? "WebpageRecorder";
const sourceName = (args.source as string) ?? "WebpageBrowser";

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outputDst = (args.output as string) ?? `recordings/${ts}_webpage.mp4`;
mkdirSync(dirname(outputDst), { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ReadyServer {
  port: number;
  ready: Promise<void>;
  close: () => void;
}

/** Tiny local HTTP server the recorded page can ping (see "Ready signal" above) once its first frame renders. */
function startReadyServer(): Promise<ReadyServer> {
  return new Promise((resolveSetup) => {
    let resolveReady: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const server = createServer((req, res) => {
      res.writeHead(204);
      res.end();
      if (req.url?.startsWith("/ready")) resolveReady();
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveSetup({ port, ready, close: () => server.close() });
    });
  });
}

function fileSizeMb(path: string): string {
  try {
    return (statSync(path).size / 1024 / 1024).toFixed(1);
  } catch {
    return "?";
  }
}

function isRetryableFsError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "EACCES" || code === "EBUSY" || code === "EPERM";
}

async function retryFs<T>(action: () => T, label: string): Promise<T> {
  const delays = [100, 250, 500, 1000, 2000, 3000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return action();
    } catch (err) {
      lastError = err;
      if (!isRetryableFsError(err) || attempt === delays.length) break;
      await sleep(delays[attempt]);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed: ${message}`, { cause: lastError });
}

async function moveFileWithRetry(sourcePath: string, destinationPath: string, label: string) {
  try {
    await retryFs(() => renameSync(sourcePath, destinationPath), label);
    return;
  } catch (err) {
    const originalError = (err as { cause?: unknown })?.cause ?? err;
    const code = (originalError as { code?: string })?.code;
    if (code !== "EXDEV" && !isRetryableFsError(originalError)) {
      throw err;
    }
    console.warn(`${label} failed; copying instead.`);
    console.warn(originalError instanceof Error ? originalError.message : String(originalError));
  }

  await retryFs(() => copyFileSync(sourcePath, destinationPath), `Copying ${label}`);
  try {
    await retryFs(() => unlinkSync(sourcePath), `Removing source after ${label}`);
  } catch (err) {
    console.warn(`Could not remove original OBS output: ${sourcePath}`);
    console.warn(err instanceof Error ? err.message : String(err));
  }
}

// ── banner ────────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log("  Webpage Recorder (OBS)");
console.log("══════════════════════════════════════════");
console.log(`  URL     : ${url}`);
console.log(`  Size    : ${width}×${height} @ ${fps} fps`);
console.log(`  Duration: ${durationSec}s`);
console.log(`  Output  : ${outputDst}`);
console.log(`  OBS WS  : ${wsUrl}`);
console.log(`  Scene   : ${sceneName} / ${sourceName}`);
console.log("══════════════════════════════════════════\n");

// ── connect ───────────────────────────────────────────────────────────────────

const obs = new OBSWebSocket();

try {
  await obs.connect(wsUrl, wsPassword || undefined);
  console.log("Connected to OBS WebSocket.");
} catch (err) {
  console.error(
    "\nCould not connect to OBS WebSocket.\n" +
      "Make sure OBS is running and WebSocket server is enabled:\n" +
      "  OBS → Tools → WebSocket Server Settings → Enable WebSocket server\n",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
}

const { outputActive } = await obs.call("GetRecordStatus");
if (outputActive) {
  console.error("\nOBS is already recording. Stop the current recording first.");
  await obs.disconnect();
  process.exit(1);
}

const recordingStopped = new Promise<string | null>((resolve) => {
  obs.on("RecordStateChanged", (data) => {
    if (data.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED") {
      resolve(data.outputPath ?? null);
    }
  });
});

// ── canvas / output resolution ────────────────────────────────────────────────

if (!noResize) {
  console.log(`Setting canvas to ${width}×${height} @ ${fps} fps...`);
  await obs.call("SetVideoSettings", {
    baseWidth: width,
    baseHeight: height,
    outputWidth: width,
    outputHeight: height,
    fpsNumerator: fps,
    fpsDenominator: 1,
  });
}

// ── scene setup ───────────────────────────────────────────────────────────────

const { scenes } = await obs.call("GetSceneList");
if (!scenes.some((s) => s.sceneName === sceneName)) {
  console.log(`Creating scene "${sceneName}"...`);
  await obs.call("CreateScene", { sceneName });
}
await obs.call("SetCurrentProgramScene", { sceneName });

// ── ready signal ──────────────────────────────────────────────────────────────

const readyServer = await startReadyServer();
const recordUrl = new URL(url);
recordUrl.searchParams.set("ready-port", String(readyServer.port));

// ── browser source ────────────────────────────────────────────────────────────

const browserSettings = {
  url: recordUrl.toString(),
  width,
  height,
  fps,
  reroute_audio: true,
  shutdown: false,
};

const { inputs } = await obs.call("GetInputList", { inputKind: "browser_source" });
if (inputs.some((i) => i.inputName === sourceName)) {
  console.log(`Updating browser source "${sourceName}"...`);
  await obs.call("SetInputSettings", { inputName: sourceName, inputSettings: browserSettings });
} else {
  console.log(`Creating browser source "${sourceName}"...`);
  await obs.call("CreateInput", {
    sceneName,
    inputName: sourceName,
    inputKind: "browser_source",
    inputSettings: browserSettings,
    sceneItemEnabled: true,
  });
}

const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
const item = sceneItems.find((i) => i.sourceName === sourceName);
if (item) {
  await obs.call("SetSceneItemTransform", {
    sceneName,
    sceneItemId: item.sceneItemId as number,
    sceneItemTransform: {
      positionX: 0,
      positionY: 0,
      boundsWidth: width,
      boundsHeight: height,
      boundsType: "OBS_BOUNDS_STRETCH",
    },
  });
}

// ── wait for page/animation to load, then record ─────────────────────────────

console.log(`Waiting for page ready signal (max ${waitMs}ms)...`);
const readyOutcome = await Promise.race([
  readyServer.ready.then(() => "ready" as const),
  sleep(waitMs).then(() => "timeout" as const),
]);
readyServer.close();
console.log(
  readyOutcome === "ready"
    ? "Page signalled ready."
    : `No ready signal after ${waitMs}ms — starting anyway.`,
);

console.log(`\n● REC  (${durationSec}s)\n`);
await obs.call("StartRecord");

const recStart = Date.now();
while (Date.now() - recStart < durationSec * 1000) {
  const elapsed = ((Date.now() - recStart) / 1000).toFixed(0);
  process.stdout.write(`\r  ${elapsed}s / ${durationSec}s`);
  await sleep(500);
}
process.stdout.write("\n");

await obs.call("StopRecord");
console.log("Stopping — waiting for OBS to finalize file...");

const obsOutputPath = await Promise.race([
  recordingStopped,
  sleep(10_000).then(() => null),
]);

await obs.disconnect();

// ── move output to destination ────────────────────────────────────────────────

if (obsOutputPath) {
  await moveFileWithRetry(obsOutputPath, outputDst, "Moving OBS recording to output path");
  console.log(`\n✓ Saved: ${outputDst}  (${fileSizeMb(outputDst)} MB)`);
} else {
  console.log("\n✓ Recording finalized. Could not detect output path — check OBS output folder.");
}
