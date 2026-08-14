#!/usr/bin/env node
/**
 * OBS recorder using OBS WebSocket API.
 *
 * Records a webpage via OBS Browser Source — real-time at any resolution
 * regardless of physical screen size. Page audio (gong, sequence sounds, etc.)
 * is captured natively via Browser Source reroute_audio — no ffmpeg synthesis
 * needed. Works both for this app's own preset routes (default) and for
 * arbitrary third-party pages (--no-tab).
 *
 * Prerequisites:
 *   1. OBS Studio 28+ installed and running
 *   2. WebSocket server enabled:
 *        OBS → Tools → WebSocket Server Settings → Enable WebSocket server
 *   3. npm install obs-websocket-js  (already done)
 *
 * Usage:
 *   node scripts/record-obs.mjs [options]
 *
 * Options:
 *   --video <id|all>            Record a video declared in utils/slides/videos.data.tsx
 *                               by id (e.g. smarter-7) instead of a raw --tab/--slides
 *                               pair. Sets --tab to preset/video-<id>/full-window,
 *                               --slides to the video's own principle count, and
 *                               defaults --output to recordings/<lang>/<video title>.mp4.
 *                               Explicit --tab/--slides/--output still override.
 *                               --video with no id, or --video all, records every
 *                               declared video instead of just one (delegates to
 *                               record-videos.mjs; --formats/--langs come from
 *                               --format/--lang, --out-dir/--dry-run/--fail-fast/
 *                               --continue-on-error are forwarded as-is).
 *   --format <name>             Output format preset (default: shorts)
 *                               Presets: shorts, tiktok, yt, yt-4k
 *   --width <px>                Custom canvas width  (overrides --format)
 *   --height <px>               Custom canvas height (overrides --format)
 *   --slides [count]            Stop recording once this many sequence slides have fully
 *                               displayed (default: 7 — this is the default stop mode even
 *                               without passing this flag). See "Stop signal" below.
 *   --duration <seconds>        Pass this alone (without --slides) to fall back to the old
 *                               fixed-duration mode instead (default when doing so: 60).
 *                               Pass alongside --slides to add it as a safety-net cap on top
 *                               of the slide-count stop signal. See "Stop signal" below.
 *   --fps <number>              Frames per second (default: 60)
 *   --url <base>                App base URL (default: http://localhost:8081)
 *   --tab <path>                App route appended to --url (default: preset/principles/full-window)
 *   --no-tab                    Record --url as-is, without appending --tab — for
 *                               recording a full third-party page URL instead of
 *                               one of this app's own preset routes.
 *   --no-refresh                Skip the frame-0 refresh (see below). Use for pages
 *                               that shouldn't be reloaded (most useful with --no-tab).
 *   --wait-ms <ms>              Give up waiting for the ready signal and record anyway after
 *                               this many ms. Only applies with --no-tab (a third-party page
 *                               that may never send the signal at all); ignored otherwise —
 *                               see "Ready signal" below.
 *   --output <path>             Destination path for finished file
 *                               (default: recordings/<ts>_animation_<format>.mp4)
 *   --ws-url <url>              OBS WebSocket URL (default: ws://localhost:4455)
 *   --ws-password <pass>        OBS WebSocket password (default: empty)
 *   --no-resize                 Skip setting OBS canvas/output resolution & fps
 *   --scene <name>              OBS scene name to use (default: AnimationRecorder)
 *   --source <name>             OBS browser source name (default: AnimationBrowser)
 *   --binaural-hz <number>      Mix binaural beat at this frequency in Hz (default: 6).
 *                               Requires headphones. Use 0 to disable.
 *   --binaural-carrier <number> Carrier sine frequency in Hz (default: 200)
 *   --binaural-volume <0-1>     Binaural tone amplitude relative to full scale (default: 0.35)
 *   --obs-sync                  Pause the animation at slide 0 until OBS is ready to record,
 *                               then signal the app to start and begin recording simultaneously.
 *                               Requires the obs-browser plugin (bundled with OBS Studio).
 *
 * Ready signal:
 *   This script starts a tiny local HTTP server and appends a `ready-port` query
 *   param to the target URL. app/preset/[id]/full-window.tsx pings it — via
 *   navigator.sendBeacon — the moment the first 3D frame has actually rendered,
 *   so recording starts exactly on cue instead of guessing a wait time. The page
 *   pings once per load, so this fires again after the frame-0 refresh below.
 *
 *   In the default (--tab) mode this app always sends the ping eventually, so
 *   there's no timeout race here — the script just waits for it, logging a
 *   heartbeat every few seconds so a stuck wait (e.g. dev server not running)
 *   is visible instead of silently starting a black recording anyway. A guessed
 *   timeout that "gives up and records anyway" would defeat the entire point.
 *   --no-tab is the exception: an arbitrary third-party URL may not know about
 *   `ready-port` and might never ping, so --wait-ms applies there as a cap.
 *
 * Stop signal:
 *   --slides works the same way, on the same local server: the URL gets a
 *   `stop-after-slides` param, and app/(tabs)/three-d.tsx pings "/stop-recording"
 *   the moment that many slides have each shown for their own full duration
 *   (which varies per slide — see estimateSequenceDurationMs). This script then
 *   waits for that ping instead of counting down a fixed --duration, so the
 *   recording always ends exactly on a slide boundary regardless of how long
 *   the content actually took to play. --duration remains available as an
 *   explicit safety-net cap (see above) if you want one.
 */

import {
  copyFileSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { createServer } from "http";
import { OBSWebSocket } from "obs-websocket-js";
import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { findVideo, fileNameFromTitle } from "./lib/videos-data.mjs";
import { parseArgs, assertKnownFlags, RECORD_OBS_FLAGS } from "./lib/cli-args.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── arg parsing ───────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
assertKnownFlags(Object.keys(args), RECORD_OBS_FLAGS, "record-obs.mjs");

// ── --video all: delegate to record-videos.mjs ────────────────────────────────
// Bare --video (no id) or --video all records every video declared in
// videos.data.tsx, named by title, instead of a single one. Reuses
// record-videos.mjs's batch loop rather than duplicating it here.
if (args.video === true || args.video === "all") {
  const forwardedArgs = ["--formats", args.format ?? "shorts", "--langs", args.lang ?? "en,pl"];
  for (const key of ["out-dir", "dry-run", "fail-fast", "continue-on-error"]) {
    if (args[key] !== undefined) {
      forwardedArgs.push(`--${key}`);
      if (args[key] !== true) forwardedArgs.push(args[key]);
    }
  }
  const result = spawnSync(
    "node",
    [resolve(__dirname, "record-videos.mjs"), ...forwardedArgs],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

// ── format presets ────────────────────────────────────────────────────────────

const FORMAT_PRESETS = {
  shorts: {
    label: "YouTube Shorts  1080×1920  9:16",
    width: 1080,
    height: 1920,
  },
  tiktok: {
    label: "TikTok          1080×1920  9:16",
    width: 1080,
    height: 1920,
  },
  yt: { label: "YouTube         1920×1080 16:9", width: 1920, height: 1080 },
  "yt-4k": {
    label: "YouTube 4K      3840×2160 16:9",
    width: 3840,
    height: 2160,
  },
};

const format = args.format ?? "shorts";
const preset = FORMAT_PRESETS[format];

if (!preset && !args.width && !args.height) {
  console.error(
    `Unknown format: "${format}". Available: ${Object.keys(FORMAT_PRESETS).join(", ")}\n` +
      "Or use --width and --height for a custom resolution.",
  );
  process.exit(1);
}

const width = parseInt(args.width ?? preset?.width, 10);
const height = parseInt(args.height ?? preset?.height, 10);
const label = preset?.label ?? `Custom ${width}×${height}`;

if (!width || !height) {
  console.error(
    "Invalid resolution. Provide --format or both --width and --height.",
  );
  process.exit(1);
}

// ── other args ────────────────────────────────────────────────────────────────

// --video <id> looks the declared video up in videos.data.tsx so --tab,
// --slides, and --output can all default from it below.
const video = args.video !== undefined ? findVideo(args.video) : null;

const durationExplicit = args.duration !== undefined;
const durationSec = parseInt(args.duration ?? "60", 10);
// Slide-count-based stopping is the default — see "Stop signal" below.
// --video defaults it to that video's own principle count (+ title card);
// otherwise 7. Passing --duration on its own (without --slides) opts back
// into the old fixed-duration mode; passing both uses --duration as a
// safety-net cap on top of the slide-count stop signal.
const slidesCount = args.slides !== undefined
  ? (args.slides === true ? 7 : parseInt(args.slides, 10))
  : (durationExplicit ? undefined : (video ? video.principleCount + 1 : 7));
const fps = parseInt(args.fps ?? "60", 10);
const binauralHz = parseFloat(args["binaural-hz"] ?? "6");
const binauralCarrier = parseFloat(args["binaural-carrier"] ?? "200");
const binauralVolume = parseFloat(args["binaural-volume"] ?? "0.35");
const baseUrl = args.url ?? "http://localhost:8081";
const tab = args.tab ?? (video ? `preset/video-${video.id}/full-window` : "preset/principles/full-window");
const noTab = args["no-tab"] === true;
const lang = args.lang ?? "";
// Only meaningful with --no-tab (see "Ready signal" above); undefined means
// "wait indefinitely for the ready ping", which is always correct in --tab mode.
const waitMs = args["wait-ms"] !== undefined ? parseInt(args["wait-ms"], 10) : undefined;
const noRefresh = args["no-refresh"] === true;
const wsUrl = args["ws-url"] ?? "ws://localhost:4455";
const wsPassword = args["ws-password"] ?? "";
const noResize = args["no-resize"] === true;
// --obs-sync: pause the animation until OBS signals start, then begin recording
// and animation simultaneously.  Requires the obs-browser plugin (ships with OBS).
const obsSync = args["obs-sync"] === true;
const SCENE_NAME = args.scene ?? "AnimationRecorder";
const SOURCE_NAME = args.source ?? "AnimationBrowser";

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const langFolder = lang || "en";
const outputDst = args.output ?? (
  video
    ? `../recordings/${langFolder}/${fileNameFromTitle(video.title)}.mp4`
    : `../recordings/${ts}_animation_${format}.mp4`
);
mkdirSync(dirname(outputDst), { recursive: true });

// Build the target URL. Query params are set on a URL object (rather than string
// concatenation) so they layer cleanly onto --url even when --no-tab is used to
// record a third-party page that already has its own query string.
const recordUrl = new URL(noTab ? baseUrl : `${baseUrl}/${tab}`);
if (lang) recordUrl.searchParams.set("lang", lang);
if (binauralHz) {
  recordUrl.searchParams.set("binaural-hz", String(binauralHz));
  recordUrl.searchParams.set("binaural-carrier", String(binauralCarrier));
  recordUrl.searchParams.set("binaural-volume", String(binauralVolume));
}
if (obsSync) recordUrl.searchParams.set("pause-until-obs", "1");
if (slidesCount !== undefined) recordUrl.searchParams.set("stop-after-slides", String(slidesCount));
const fullUrl = recordUrl.toString();

// ── helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Races a single ping against an optional timeout; timeoutMs undefined waits indefinitely. */
function armSignal(setResolver, timeoutMs, onHeartbeat) {
  const racers = [
    new Promise((resolve) => {
      setResolver(() => resolve("ready"));
    }),
  ];
  if (typeof timeoutMs === "number") {
    racers.push(sleep(timeoutMs).then(() => "timeout"));
  }
  const heartbeat = onHeartbeat ? setInterval(onHeartbeat, 5000) : null;
  return Promise.race(racers).finally(() => {
    setResolver(null);
    if (heartbeat) clearInterval(heartbeat);
  });
}

/**
 * Tiny local HTTP server the recorded page can ping (see "Ready signal" above)
 * once its first frame renders, and again at "/stop-recording" once a targeted
 * slide count has fully displayed (see --slides). Each signal can be re-armed
 * (e.g. the "ready" ping fires once per navigation, so waitForReady() can be
 * called again after a refresh to catch the next one).
 */
function startReadyServer() {
  return new Promise((resolveSetup) => {
    let pendingReadyResolve = null;
    let pendingStopResolve = null;
    const server = createServer((req, res) => {
      res.writeHead(204);
      res.end();
      if (req.url?.startsWith("/stop-recording")) pendingStopResolve?.();
      else if (req.url?.startsWith("/ready")) pendingReadyResolve?.();
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveSetup({
        port,
        waitForReady: (timeoutMs, onHeartbeat) =>
          armSignal((r) => { pendingReadyResolve = r; }, timeoutMs, onHeartbeat),
        waitForStop: (timeoutMs, onHeartbeat) =>
          armSignal((r) => { pendingStopResolve = r; }, timeoutMs, onHeartbeat),
        close: () => server.close(),
      });
    });
  });
}

async function waitForSignalAndLog(waitFn, label, timeoutMs) {
  console.log(
    typeof timeoutMs === "number"
      ? `Waiting for ${label} signal (max ${timeoutMs}ms)...`
      : `Waiting for ${label} signal...`,
  );
  let elapsedSec = 0;
  const outcome = await waitFn(timeoutMs, () => {
    elapsedSec += 5;
    console.log(`  ...still waiting for ${label} signal (${elapsedSec}s elapsed). Is the dev server running?`);
  });
  console.log(
    outcome === "ready"
      ? `${label[0].toUpperCase()}${label.slice(1)} signal received.`
      : `No ${label} signal after ${timeoutMs}ms — proceeding anyway.`,
  );
  return outcome;
}

function fileSizeMb(path) {
  try {
    return (statSync(path).size / 1024 / 1024).toFixed(1);
  } catch {
    return "?";
  }
}

function isRetryableFsError(err) {
  return ["EACCES", "EBUSY", "EPERM"].includes(err?.code);
}

async function retryFs(action, label) {
  const delays = [100, 250, 500, 1000, 2000, 3000];
  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return action();
    } catch (err) {
      lastError = err;
      if (!isRetryableFsError(err) || attempt === delays.length) break;
      await sleep(delays[attempt]);
    }
  }

  throw new Error(`${label} failed: ${lastError?.message ?? lastError}`, {
    cause: lastError,
  });
}

async function moveFileWithRetry(sourcePath, destinationPath, label) {
  try {
    await retryFs(() => renameSync(sourcePath, destinationPath), label);
    return;
  } catch (err) {
    const originalError = err?.cause ?? err;
    if (originalError?.code !== "EXDEV" && !isRetryableFsError(originalError)) {
      throw err;
    }
    console.warn(`${label} failed; copying instead.`);
    console.warn(originalError.message);
  }

  await retryFs(() => copyFileSync(sourcePath, destinationPath), `Copying ${label}`);
  try {
    await retryFs(() => unlinkSync(sourcePath), `Removing source after ${label}`);
  } catch (err) {
    console.warn(`Could not remove original OBS output: ${sourcePath}`);
    console.warn(err?.cause?.message ?? err.message);
  }
}

// ── banner ────────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════");
console.log("  Animation Recorder (OBS)");
console.log("══════════════════════════════════════════");
if (video) console.log(`  Video   : ${video.id}  "${video.title}"`);
console.log(`  Format  : ${label}`);
console.log(`  FPS     : ${fps}`);
console.log(`  Duration: ${durationSec}s`);
console.log(`  URL     : ${fullUrl}`);
console.log(`  Output  : ${outputDst}`);
console.log(`  OBS WS  : ${wsUrl}`);
console.log(`  Scene   : ${SCENE_NAME} / ${SOURCE_NAME}`);
if (binauralHz) {
  console.log(
    `  Binaural: ${binauralHz} Hz beat  (${binauralCarrier} Hz / ${binauralCarrier + binauralHz} Hz)  ⚠ headphones required`,
  );
}
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
    err.message,
  );
  process.exit(1);
}

// Abort cleanly if OBS is already recording
const { outputActive } = await obs.call("GetRecordStatus");
if (outputActive) {
  console.error(
    "\nOBS is already recording. Stop the current recording first.",
  );
  await obs.disconnect();
  process.exit(1);
}

// Promise that resolves with the output path once OBS finishes writing the file
const recordingStopped = new Promise((resolve) => {
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
if (!scenes.some((s) => s.sceneName === SCENE_NAME)) {
  console.log(`Creating scene "${SCENE_NAME}"...`);
  await obs.call("CreateScene", { sceneName: SCENE_NAME });
}
await obs.call("SetCurrentProgramScene", { sceneName: SCENE_NAME });

// ── ready signal ──────────────────────────────────────────────────────────────

const readyServer = await startReadyServer();
recordUrl.searchParams.set("ready-port", String(readyServer.port));
const fullUrlWithReady = recordUrl.toString();

// ── browser source ────────────────────────────────────────────────────────────

const browserSettings = {
  url: fullUrlWithReady,
  width,
  height,
  fps,
  reroute_audio: true, // capture page audio natively (gong, sequence sounds, etc.)
  shutdown: false,
};

const { inputs } = await obs.call("GetInputList", {
  inputKind: "browser_source",
});
if (inputs.some((i) => i.inputName === SOURCE_NAME)) {
  console.log(`Updating browser source "${SOURCE_NAME}"...`);
  await obs.call("SetInputSettings", {
    inputName: SOURCE_NAME,
    inputSettings: browserSettings,
  });
} else {
  console.log(`Creating browser source "${SOURCE_NAME}"...`);
  await obs.call("CreateInput", {
    sceneName: SCENE_NAME,
    inputName: SOURCE_NAME,
    inputKind: "browser_source",
    inputSettings: browserSettings,
    sceneItemEnabled: true,
  });
}

// Stretch source to fill the canvas
const { sceneItems } = await obs.call("GetSceneItemList", {
  sceneName: SCENE_NAME,
});
const item = sceneItems.find((i) => i.sourceName === SOURCE_NAME);
if (item) {
  await obs.call("SetSceneItemTransform", {
    sceneName: SCENE_NAME,
    sceneItemId: item.sceneItemId,
    sceneItemTransform: {
      positionX: 0,
      positionY: 0,
      boundsWidth: width,
      boundsHeight: height,
      boundsType: "OBS_BOUNDS_STRETCH",
    },
  });
}

// ── wait for page to load, refresh to frame 0, then start in sync ────────────

// --wait-ms only applies to --no-tab (third-party pages that may never ping —
// see "Ready signal" above); --tab mode always waits for the real signal.
const effectiveWaitMs = noTab ? waitMs : undefined;

await waitForSignalAndLog(readyServer.waitForReady, "page ready", effectiveWaitMs);

// Refresh so the animation resets to frame 0 (skip with --no-refresh, e.g. for
// third-party pages that shouldn't be reloaded). Refreshing always triggers a
// new navigation, so the page pings the ready server again once its own first
// frame renders — we wait for that instead of guessing.
if (!noRefresh) {
  console.log("Refreshing browser source to reset animation to frame 0...");
  try {
    await obs.call("PressInputPropertiesButton", {
      inputName: SOURCE_NAME,
      propertyName: "refreshnocache",
    });
  } catch (err) {
    console.warn("Could not refresh browser source:", err.message);
  }

  await waitForSignalAndLog(
    readyServer.waitForReady,
    obsSync ? "slide 0 ready" : "page ready",
    effectiveWaitMs,
  );
}

if (obsSync) {
  // Signal the app to start the sequence, then immediately begin recording —
  // animation and recording start at the same instant.
  console.log("Signalling app to start sequence (obsCustomEvent: startSequence)...");
  try {
    await obs.call("CallVendorRequest", {
      vendorName: "obs-browser",
      requestType: "emit_event",
      requestData: {
        event_name: "obs_custom_event",
        event_data: { action: "startSequence" },
      },
    });
  } catch (err) {
    console.warn(
      "Could not emit obsCustomEvent — falling back to unsynced start.\n" +
      "(Make sure the obs-browser plugin is loaded in OBS.)\n" +
      err.message,
    );
  }
}

// ── record ────────────────────────────────────────────────────────────────────

if (slidesCount !== undefined) {
  console.log(`\n● REC  (stopping after ${slidesCount} slide${slidesCount === 1 ? "" : "s"})\n`);
  await obs.call("StartRecord");
  // durationSec is only a safety cap here, and only if the caller explicitly
  // passed --duration — the app always sends the stop signal eventually, so an
  // unrequested default cap could cut off a legitimately longer slide count.
  await waitForSignalAndLog(
    readyServer.waitForStop,
    "stop-recording",
    durationExplicit ? durationSec * 1000 : undefined,
  );
} else {
  console.log(`\n● REC  (${durationSec}s)\n`);
  await obs.call("StartRecord");
  const recStart = Date.now();
  while (Date.now() - recStart < durationSec * 1000) {
    const elapsed = ((Date.now() - recStart) / 1000).toFixed(0);
    process.stdout.write(`\r  ${elapsed}s / ${durationSec}s`);
    await sleep(500);
  }
  process.stdout.write("\n");
}

readyServer.close();
await obs.call("StopRecord");
console.log("Stopping — waiting for OBS to finalize file...");

// Wait for RecordStateChanged(STOPPED) which carries the output path
const obsOutputPath = await Promise.race([
  recordingStopped,
  sleep(10_000).then(() => null), // 10s timeout fallback
]);

await obs.disconnect();

// ── move output to recordings/ ────────────────────────────────────────────────

if (obsOutputPath) {
  await moveFileWithRetry(obsOutputPath, outputDst, "Moving OBS recording to output path");
  // Binaural is generated by the app via Web Audio API and captured by OBS reroute_audio —
  // no ffmpeg post-processing needed here.
  console.log(`\n✓ Saved: ${outputDst}  (${fileSizeMb(outputDst)} MB)`);
} else {
  console.log(
    "\n✓ Recording finalized. Could not detect output path — check OBS output folder.",
  );
}
