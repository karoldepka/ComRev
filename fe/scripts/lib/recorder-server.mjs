/**
 * Tiny local HTTP server that a recorded page pings — ready/precompute-done/
 * stop signals and the sound-event log (see app/preset/[id]/full-window.tsx's
 * pingRecorder calls, and "Ready signal"/"Stop signal"/"Sound events" in
 * record-obs.mjs's file header for the full protocol). Shared by
 * record-obs.mjs (OBS, waits on real wall-clock time via the promise-based
 * waitForReady/waitForPrecomputeDone/waitForStop) and record-playwright.mjs's
 * frame-by-frame mode (drives a fake browser clock instead, so it polls the
 * synchronous isReady()/isPrecomputeDone()/isStopped() getters between frame
 * advances rather than awaiting a promise).
 *
 * /precompute-done fires once every slide's text geometry has finished
 * building in the worker pool (see onAllMeshesPrecomputed in
 * app/(tabs)/three-d.tsx) — recording waits for it after /ready so no slide's
 * display gets silently stretched by a mid-recording mesh-build stall, and so
 * the frame-by-frame engine never contends with live worker builds.
 */

import { createServer } from 'http';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Races a single ping against an optional timeout; timeoutMs undefined waits indefinitely. */
export function armSignal(setResolver, timeoutMs, onHeartbeat) {
  const racers = [
    new Promise((resolve) => {
      setResolver(() => resolve('ready'));
    }),
  ];
  if (typeof timeoutMs === 'number') {
    racers.push(sleep(timeoutMs).then(() => 'timeout'));
  }
  const heartbeat = onHeartbeat ? setInterval(onHeartbeat, 1000) : null;
  return Promise.race(racers).finally(() => {
    setResolver(null);
    if (heartbeat) clearInterval(heartbeat);
  });
}

/**
 * Starts the server. Returns both the promise-based waiters (for real-time
 * callers like record-obs.mjs) and plain isReady()/isStopped() booleans (for
 * frame-stepping callers, which drive their own loop and just need to poll
 * whether a signal has arrived yet — awaiting a promise would require
 * yielding past the current fake-clock frame, which isn't what we want).
 */
export function startReadyServer() {
  return new Promise((resolveSetup) => {
    let pendingReadyResolve = null;
    let pendingStopResolve = null;
    let pendingPrecomputeDoneResolve = null;
    let readyReceived = false;
    let stopReceived = false;
    let precomputeDoneReceived = false;
    // Unlike ready/stop, this is a single one-shot promise for the whole
    // recording, not re-armed per wait — the app can report a miss at any
    // point (most likely during the initial page load, while it's building
    // the slide list), so every wait below races against this same promise.
    let resolveTranslationMissing;
    const translationMissing = new Promise((r) => { resolveTranslationMissing = r; });

    // Populated over the course of the whole recording (see "Sound events"
    // in record-obs.mjs's file header) — read out once recording stops, to
    // feed the post-recording audio mix instead of anything being played
    // live by the browser.
    const soundEvents = [];
    let musicKind;

    const server = createServer((req, res) => {
      res.writeHead(204);
      res.end();
      if (req.url?.startsWith('/stop-recording')) {
        stopReceived = true;
        pendingStopResolve?.();
      } else if (req.url?.startsWith('/ready')) {
        readyReceived = true;
        pendingReadyResolve?.();
      } else if (req.url?.startsWith('/precompute-done')) {
        precomputeDoneReceived = true;
        pendingPrecomputeDoneResolve?.();
      } else if (req.url?.startsWith('/translation-missing')) {
        const url = new URL(req.url, 'http://localhost');
        resolveTranslationMissing({
          key: url.searchParams.get('key') ?? '(unknown)',
          lang: url.searchParams.get('lang') ?? '(unknown)',
        });
      } else if (req.url?.startsWith('/sound-event')) {
        const url = new URL(req.url, 'http://localhost');
        const variant = url.searchParams.get('variant');
        const tMs = parseInt(url.searchParams.get('t') ?? '', 10);
        if (variant && Number.isFinite(tMs)) soundEvents.push({ variant, tMs });
      } else if (req.url?.startsWith('/sound-config')) {
        const url = new URL(req.url, 'http://localhost');
        musicKind = url.searchParams.get('music') ?? musicKind;
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolveSetup({
        port,
        waitForReady: (timeoutMs, onHeartbeat) =>
          armSignal((r) => { pendingReadyResolve = r; }, timeoutMs, onHeartbeat),
        waitForStop: (timeoutMs, onHeartbeat) =>
          armSignal((r) => { pendingStopResolve = r; }, timeoutMs, onHeartbeat),
        waitForPrecomputeDone: (timeoutMs, onHeartbeat) =>
          armSignal((r) => { pendingPrecomputeDoneResolve = r; }, timeoutMs, onHeartbeat),
        isReady: () => readyReceived,
        isStopped: () => stopReceived,
        isPrecomputeDone: () => precomputeDoneReceived,
        translationMissing,
        getSoundLog: () => ({ music: musicKind, events: soundEvents }),
        close: () => server.close(),
      });
    });
  });
}

/**
 * Races `promise` against the recording's one-shot translation-missing
 * signal, throwing if that signal wins — so a video for language X never
 * silently finishes recording with English content in it.
 */
export async function raceTranslationMissing(promise, readyServer) {
  const result = await Promise.race([promise, readyServer.translationMissing]);
  if (result && typeof result === 'object' && 'key' in result) {
    throw new Error(
      `Translation missing for "${result.key}" (lang=${result.lang}) — aborting recording instead of shipping English content.`,
    );
  }
  return result;
}

export async function waitForSignalAndLog(waitFn, label, timeoutMs, readyServer) {
  console.log(
    typeof timeoutMs === 'number'
      ? `Waiting for ${label} signal (max ${timeoutMs}ms)...`
      : `Waiting for ${label} signal...`,
  );
  let elapsedSec = 0;
  let dotsOnLine = 0;
  const outcome = await raceTranslationMissing(
    // 1Hz beacon: a dot every second so the process visibly hasn't hung,
    // with the fuller "is the dev server running?" reminder every 5s.
    waitFn(timeoutMs, () => {
      elapsedSec += 1;
      if (elapsedSec % 5 === 0) {
        if (dotsOnLine > 0) process.stdout.write('\n');
        dotsOnLine = 0;
        console.log(`  ...still waiting for ${label} signal (${elapsedSec}s elapsed). Is the dev server running?`);
      } else {
        process.stdout.write('.');
        dotsOnLine += 1;
      }
    }),
    readyServer,
  );
  if (dotsOnLine > 0) process.stdout.write('\n');
  console.log(
    outcome === 'ready'
      ? `${label[0].toUpperCase()}${label.slice(1)} signal received.`
      : `No ${label} signal after ${timeoutMs}ms — proceeding anyway.`,
  );
  return outcome;
}

/** Returns a synchronous check function that throws once the recording's
 * one-shot translation-missing signal has fired — for loops (e.g. a frame-
 * stepping capture loop) that want to bail out promptly between iterations
 * without awaiting a promise each time. */
export function makeTranslationMissingChecker(readyServer) {
  let info = null;
  readyServer.translationMissing.then((result) => { info = result; });
  return () => {
    if (info) {
      throw new Error(
        `Translation missing for "${info.key}" (lang=${info.lang}) — aborting recording instead of shipping English content.`,
      );
    }
  };
}
