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
 * connectObs/resolveOptions/recordOne below are also imported directly by
 * record-videos.mjs and record-all.mjs so a whole batch of recordings shares
 * one OBS WebSocket connection instead of opening (and disconnecting) a new
 * one per video — run this file's --help to see all flags, or read
 * lib/cli-args.mjs's createRecordObsProgram for the authoritative list.
 *
 * Prerequisites:
 *   1. OBS Studio 28+ installed and running
 *   2. WebSocket server enabled:
 *        OBS → Tools → WebSocket Server Settings → Enable WebSocket server
 *   3. npm install obs-websocket-js  (already done)
 *
 * Usage:
 *   node scripts/record-obs.mjs [options]
 *   node scripts/record-obs.mjs --help          (full flag reference)
 *
 * --video <id|all>:
 *   Record a video declared in utils/slides/videos.data.tsx by id (e.g.
 *   smarter-7) instead of a raw --tab/--slides pair. Sets --tab to
 *   preset/video-<id>/full-window, --slides to the video's own principle
 *   count, and defaults --output to recordings/<lang>/<video title>.mp4.
 *   Explicit --tab/--slides/--output still override.
 *   Bare --video, or --video all, records every declared video in one OBS
 *   connection (delegates in-process to record-videos.mjs's runBatch —
 *   --formats/--langs come from --format/--lang; --out-dir/--dry-run/
 *   --fail-fast/--continue-on-error are forwarded as-is).
 *
 * Ready signal:
 *   This script starts a tiny local HTTP server and appends a `ready-port`
 *   query param to the target URL. app/preset/[id]/full-window.tsx pings it
 *   — via navigator.sendBeacon — the moment the first 3D frame has actually
 *   rendered, so recording starts exactly on cue instead of guessing a wait
 *   time. The page pings once per load, so this fires again after the
 *   frame-0 refresh below.
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
import { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findVideo, fileNameFromTitle, titleForLang } from "./lib/videos-data.mjs";
import { createRecordObsProgram, parseFlags } from "./lib/cli-args.mjs";

// ── format presets ────────────────────────────────────────────────────────────

export const FORMAT_PRESETS = {
  shorts: { label: "YouTube Shorts  1080×1920  9:16", width: 1080, height: 1920 },
  tiktok: { label: "TikTok          1080×1920  9:16", width: 1080, height: 1920 },
  yt: { label: "YouTube         1920×1080 16:9", width: 1920, height: 1080 },
  "yt-4k": { label: "YouTube 4K      3840×2160 16:9", width: 3840, height: 2160 },
};

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

/** Adds a one-shot listener for the STOPPED transition and removes itself —
 * repeated recordOne() calls on a shared `obs` connection would otherwise
 * stack up a permanent listener per recording. */
function waitForRecordStopped(obs) {
  return new Promise((resolvePromise) => {
    const handler = (data) => {
      if (data.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED") {
        obs.off("RecordStateChanged", handler);
        resolvePromise(data.outputPath ?? null);
      }
    };
    obs.on("RecordStateChanged", handler);
  });
}

// ── connect ───────────────────────────────────────────────────────────────────

/** Connects once; reuse the returned client across multiple recordOne() calls
 * (see record-videos.mjs/record-all.mjs) rather than reconnecting per video. */
export async function connectObs(wsUrl, wsPassword) {
  const obs = new OBSWebSocket();
  try {
    await obs.connect(wsUrl, wsPassword || undefined);
    console.log(`Connected to OBS WebSocket (${wsUrl}).`);
  } catch (err) {
    console.error(
      "\nCould not connect to OBS WebSocket.\n" +
        "Make sure OBS is running and WebSocket server is enabled:\n" +
        "  OBS → Tools → WebSocket Server Settings → Enable WebSocket server\n",
      err.message,
    );
    process.exit(1);
  }
  return obs;
}

// ── resolve raw flags into a recording configuration ──────────────────────────

/**
 * Turns Commander-parsed options (as returned by createRecordObsProgram(),
 * whether from this script's own argv or forwarded from a batch script) into
 * the fully-resolved configuration recordOne() needs. Pure computation, no
 * OBS/network/filesystem side effects other than mkdir for the output dir.
 */
export function resolveOptions(rawOpts) {
  const format = rawOpts.format ?? "shorts";
  const preset = FORMAT_PRESETS[format];

  if (!preset && !rawOpts.width && !rawOpts.height) {
    console.error(
      `Unknown format: "${format}". Available: ${Object.keys(FORMAT_PRESETS).join(", ")}\n` +
        "Or use --width and --height for a custom resolution.",
    );
    process.exit(1);
  }

  const width = parseInt(rawOpts.width ?? preset?.width, 10);
  const height = parseInt(rawOpts.height ?? preset?.height, 10);
  const label = preset?.label ?? `Custom ${width}×${height}`;

  if (!width || !height) {
    console.error("Invalid resolution. Provide --format or both --width and --height.");
    process.exit(1);
  }

  // --video <id> looks the declared video up in videos.data.tsx so --tab,
  // --slides, and --output can all default from it below.
  const video = rawOpts.video !== undefined && rawOpts.video !== true && rawOpts.video !== "all"
    ? findVideo(rawOpts.video)
    : null;

  const durationExplicit = rawOpts.duration !== undefined;
  const durationSec = parseInt(rawOpts.duration ?? "60", 10);
  // Slide-count-based stopping is the default — see "Stop signal" in the file
  // header. --video defaults it to that video's own principle count (+ title
  // card); otherwise 7. Passing --duration on its own (without --slides) opts
  // back into the old fixed-duration mode; passing both uses --duration as a
  // safety-net cap on top of the slide-count stop signal.
  const slidesCount = rawOpts.slides !== undefined
    ? (rawOpts.slides === true ? 7 : parseInt(rawOpts.slides, 10))
    : (durationExplicit ? undefined : (video ? video.principleCount + 1 : 7));
  const fps = parseInt(rawOpts.fps ?? "60", 10);
  const binauralHz = parseFloat(rawOpts.binauralHz ?? "6");
  const binauralCarrier = parseFloat(rawOpts.binauralCarrier ?? "200");
  const binauralVolume = parseFloat(rawOpts.binauralVolume ?? "0.35");
  const baseUrl = rawOpts.url ?? "http://localhost:8081";
  const tab = rawOpts.tab === false
    ? undefined
    : (rawOpts.tab ?? (video ? `preset/video-${video.id}/full-window` : "preset/principles/full-window"));
  const noTab = rawOpts.tab === false;
  const lang = rawOpts.lang ?? "";
  // Only meaningful with --no-tab (see "Ready signal" above); undefined means
  // "wait indefinitely for the ready ping", which is always correct in --tab mode.
  const waitMs = rawOpts.waitMs !== undefined ? parseInt(rawOpts.waitMs, 10) : undefined;
  const noRefresh = rawOpts.refresh === false;
  const wsUrl = rawOpts.wsUrl ?? "ws://localhost:4455";
  const wsPassword = rawOpts.wsPassword ?? "";
  const noResize = rawOpts.resize === false;
  // --obs-sync: pause the animation until OBS signals start, then begin recording
  // and animation simultaneously.  Requires the obs-browser plugin (ships with OBS).
  const obsSync = rawOpts.obsSync === true;
  const sceneName = rawOpts.scene ?? "AnimationRecorder";
  const sourceName = rawOpts.source ?? "AnimationBrowser";

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const langFolder = lang || "en";
  const outputDst = rawOpts.output ?? (
    video
      ? `../recordings/${langFolder}/${fileNameFromTitle(titleForLang(video.title, lang))}.mp4`
      : `../recordings/${ts}_animation_${format}.mp4`
  );

  return {
    video, format, width, height, label, fps, durationSec, durationExplicit,
    slidesCount, binauralHz, binauralCarrier, binauralVolume, baseUrl, tab,
    noTab, lang, waitMs, noRefresh, wsUrl, wsPassword, noResize, obsSync,
    sceneName, sourceName, outputDst,
  };
}

// ── record one ──────────────────────────────────────────────────────────────

/** Records a single video using an already-connected `obs` client — pass the
 * same client to multiple calls to share one OBS connection across a batch. */
export async function recordOne(obs, resolved) {
  const {
    video, label, fps, durationSec, durationExplicit, slidesCount, binauralHz,
    binauralCarrier, binauralVolume, baseUrl, tab, noTab, lang, waitMs,
    noRefresh, noResize, obsSync, sceneName, sourceName, outputDst,
    width, height,
  } = resolved;

  mkdirSync(dirname(outputDst), { recursive: true });

  // Build the target URL. Query params are set on a URL object (rather than
  // string concatenation) so they layer cleanly onto --url even when --no-tab
  // is used to record a third-party page that already has its own query string.
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

  console.log("\n══════════════════════════════════════════");
  console.log("  Animation Recorder (OBS)");
  console.log("══════════════════════════════════════════");
  if (video) console.log(`  Video   : ${video.id}  "${video.title}"`);
  console.log(`  Format  : ${label}`);
  console.log(`  FPS     : ${fps}`);
  console.log(`  Duration: ${durationSec}s`);
  console.log(`  URL     : ${fullUrl}`);
  console.log(`  Output  : ${outputDst}`);
  console.log(`  Scene   : ${sceneName} / ${sourceName}`);
  if (binauralHz) {
    console.log(
      `  Binaural: ${binauralHz} Hz beat  (${binauralCarrier} Hz / ${binauralCarrier + binauralHz} Hz)  ⚠ headphones required`,
    );
  }
  console.log("══════════════════════════════════════════\n");

  // Abort cleanly if OBS is already recording
  const { outputActive } = await obs.call("GetRecordStatus");
  if (outputActive) {
    throw new Error("OBS is already recording. Stop the current recording first.");
  }

  const recordingStopped = waitForRecordStopped(obs);

  // ── canvas / output resolution ──────────────────────────────────────────────

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

  // ── scene setup ──────────────────────────────────────────────────────────────

  const { scenes } = await obs.call("GetSceneList");
  if (!scenes.some((s) => s.sceneName === sceneName)) {
    console.log(`Creating scene "${sceneName}"...`);
    await obs.call("CreateScene", { sceneName });
  }
  await obs.call("SetCurrentProgramScene", { sceneName });

  // ── ready signal ─────────────────────────────────────────────────────────────

  const readyServer = await startReadyServer();
  recordUrl.searchParams.set("ready-port", String(readyServer.port));
  const fullUrlWithReady = recordUrl.toString();

  // ── browser source ───────────────────────────────────────────────────────────

  const browserSettings = {
    url: fullUrlWithReady,
    width,
    height,
    fps,
    reroute_audio: true, // capture page audio natively (gong, sequence sounds, etc.)
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

  // Stretch source to fill the canvas
  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
  const item = sceneItems.find((i) => i.sourceName === sourceName);
  if (item) {
    await obs.call("SetSceneItemTransform", {
      sceneName,
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

  // ── wait for page to load, refresh to frame 0, then start in sync ──────────

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
      await obs.call("PressInputPropertiesButton", { inputName: sourceName, propertyName: "refreshnocache" });
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
        requestData: { event_name: "obs_custom_event", event_data: { action: "startSequence" } },
      });
    } catch (err) {
      console.warn(
        "Could not emit obsCustomEvent — falling back to unsynced start.\n" +
        "(Make sure the obs-browser plugin is loaded in OBS.)\n" +
        err.message,
      );
    }
  }

  // ── record ───────────────────────────────────────────────────────────────────

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

  // ── move output to recordings/ ──────────────────────────────────────────────

  if (obsOutputPath) {
    await moveFileWithRetry(obsOutputPath, outputDst, "Moving OBS recording to output path");
    // Binaural is generated by the app via Web Audio API and captured by OBS reroute_audio —
    // no ffmpeg post-processing needed here.
    console.log(`\n✓ Saved: ${outputDst}  (${fileSizeMb(outputDst)} MB)`);
  } else {
    console.log("\n✓ Recording finalized. Could not detect output path — check OBS output folder.");
  }
  return outputDst;
}

// ── CLI entry ────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  // Fired without a top-level await on purpose: Node's ESM loader can flag
  // "unsettled top-level await" diagnostics when a top-level-awaited dynamic
  // import() (below) is itself part of a module graph with its own guarded
  // top-level await (record-videos.mjs). Kicking main() off unawaited and
  // catching its rejection sidesteps that class of loader edge case entirely.
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function main() {
  const rawOpts = parseFlags(createRecordObsProgram(), process.argv.slice(2));

  if (rawOpts.video === true || rawOpts.video === "all") {
    // Delegates in-process (no subprocess spawn) to record-videos.mjs's
    // runBatch, so the whole batch shares this single OBS connection instead
    // of opening a new one per video.
    const { runBatch } = await import("./record-videos.mjs");
    const langs = (rawOpts.lang || "en,pl").split(",").map((s) => s.trim()).filter(Boolean);
    const { results } = await runBatch({
      formats: [rawOpts.format ?? "shorts"],
      langs,
      outDir: rawOpts.outDir,
      dryRun: rawOpts.dryRun === true,
      failFast: rawOpts.failFast === true,
      continueOnError: rawOpts.continueOnError !== false,
      baseOpts: rawOpts,
    });
    if (results.some((r) => !r.ok)) process.exitCode = 1;
    return;
  }

  const resolved = resolveOptions(rawOpts);
  if (rawOpts.dryRun === true) {
    console.log("\n══════════════════════════════════════════");
    console.log("  Animation Recorder (OBS) — DRY RUN");
    console.log("══════════════════════════════════════════");
    if (resolved.video) console.log(`  Video   : ${resolved.video.id}  "${resolved.video.title}"`);
    console.log(`  Format  : ${resolved.label}`);
    console.log(`  FPS     : ${resolved.fps}`);
    console.log(`  Tab     : ${resolved.noTab ? "(none — recording --url as-is)" : resolved.tab}`);
    console.log(`  Slides  : ${resolved.slidesCount ?? `(fixed ${resolved.durationSec}s)`}`);
    console.log(`  Output  : ${resolved.outputDst}`);
    console.log("══════════════════════════════════════════\n");
    return;
  }

  const obs = await connectObs(resolved.wsUrl, resolved.wsPassword);
  try {
    await recordOne(obs, resolved);
  } finally {
    await obs.disconnect();
  }
}
