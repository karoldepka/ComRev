#!/usr/bin/env node
/**
 * OBS recorder using OBS WebSocket API.
 *
 * Records the animation app via OBS Browser Source — real-time at any resolution
 * regardless of physical screen size.  Page audio (gong, sequence sounds) is
 * captured natively via Browser Source reroute_audio — no ffmpeg synthesis needed.
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
 *   --format <name>             Output format preset (default: shorts)
 *                               Presets: shorts, tiktok, yt, yt-4k
 *   --width <px>                Custom canvas width  (overrides --format)
 *   --height <px>               Custom canvas height (overrides --format)
 *   --duration <seconds>        Recording duration (default: 30)
 *   --fps <number>              Frames per second (default: 60)
 *   --tab <path>                App route to open (default: preset/mcon/full-window)
 *   --url <base>                App base URL (default: http://localhost:8081)
 *   --wait-ms <ms>              Wait after browser source loads before recording (default: 3000)
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
 */

import {
  copyFileSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { OBSWebSocket } from "obs-websocket-js";
import { dirname } from "path";

// ── arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const result = {};
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

const durationSec = parseInt(args.duration ?? "30", 10);
const fps = parseInt(args.fps ?? "60", 10);
const binauralHz = parseFloat(args["binaural-hz"] ?? "6");
const binauralCarrier = parseFloat(args["binaural-carrier"] ?? "200");
const binauralVolume = parseFloat(args["binaural-volume"] ?? "0.35");
const tab = args.tab ?? "preset/motivation/full-window";
const lang = args.lang ?? "";
const baseUrl = args.url ?? "http://localhost:8081";
const waitMs = parseInt(args["wait-ms"] ?? "3000", 10);
const wsUrl = args["ws-url"] ?? "ws://localhost:4455";
const wsPassword = args["ws-password"] ?? "";
const noResize = args["no-resize"] === true;
// --obs-sync: pause the animation until OBS signals start, then begin recording
// and animation simultaneously.  Requires the obs-browser plugin (ships with OBS).
const obsSync = args["obs-sync"] === true;
const SCENE_NAME = args.scene ?? "AnimationRecorder";
const SOURCE_NAME = args.source ?? "AnimationBrowser";

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outputDst = args.output ?? `../recordings/${ts}_animation_${format}.mp4`;
mkdirSync(dirname(outputDst), { recursive: true });

// Build URL — binaural params go to the app (played via Web Audio, captured by OBS reroute_audio)
const queryParams = new URLSearchParams();
if (lang) queryParams.set("lang", lang);
if (binauralHz) {
  queryParams.set("binaural-hz", String(binauralHz));
  queryParams.set("binaural-carrier", String(binauralCarrier));
  queryParams.set("binaural-volume", String(binauralVolume));
}
if (obsSync) queryParams.set("pause-until-obs", "1");
const fullUrl = `${baseUrl}/${tab}${queryParams.size ? `?${queryParams}` : ""}`;

// ── helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// ── browser source ────────────────────────────────────────────────────────────

const browserSettings = {
  url: fullUrl,
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

console.log(`Waiting ${waitMs}ms for page to load...`);
await sleep(waitMs);

// Refresh so the animation resets to frame 0.
// With --obs-sync the app holds at frame 0 waiting for our signal, so we only
// need a short settle wait; without it we wait the full waitMs again.
console.log("Refreshing browser source to reset animation to frame 0...");
try {
  await obs.call("PressInputPropertiesButton", {
    inputName: SOURCE_NAME,
    propertyName: "refreshnocache",
  });
} catch (err) {
  console.warn("Could not refresh browser source:", err.message);
}

if (obsSync) {
  // Give the page just enough time to fully render slide 0 before we fire.
  const settleMs = Math.min(waitMs, 2000);
  console.log(`Waiting ${settleMs}ms for slide 0 to render...`);
  await sleep(settleMs);

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
} else {
  console.log(`Waiting ${waitMs}ms for animation to reach frame 0...`);
  await sleep(waitMs);
}

// ── record ────────────────────────────────────────────────────────────────────

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
