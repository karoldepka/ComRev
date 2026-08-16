#!/usr/bin/env node
/**
 * Screen recorder using Playwright.
 *
 * Two modes:
 *
 *   frame-by-frame  (--frames)
 *     Installs a fake browser clock (Playwright's page.clock), then advances
 *     it by exactly 1/fps seconds per iteration and screenshots the canvas —
 *     in principle this decouples recording from wall-clock time entirely
 *     (the page never plays audio live, so there's nothing real-time to stay
 *     in sync with) and should make recording much faster.
 *
 *     NOT RECOMMENDED for this app's own preset/video routes as currently
 *     built: measured slower than the OBS engine, not faster. The fake clock
 *     only controls the main-thread timers — it can't accelerate the real,
 *     CPU-bound text-geometry mesh building that happens in a Web Worker
 *     (350ms-2.7s per unique slide, observed), and running that concurrently
 *     with per-frame page.screenshot() calls causes severe GPU contention
 *     (screenshots taking up to 13s each — "GPU stall due to ReadPixels").
 *     There's also an unresolved correctness bug: the slide sequence can race
 *     ahead of the ready-signal warm-up loop, making --slides stop far too
 *     early. Left in place (opt-in via --frames / --engine frames) as clean,
 *     reusable infrastructure for pages that *are* purely timer/RAF driven —
 *     just don't reach for it here without fixing both issues above first.
 *     Shares --video/--slides/--variant/--format with record-obs.mjs (same
 *     resolveOptions()) — see record-videos.mjs's --engine frames for batch use.
 *
 *   realtime (default)
 *     Records using Playwright's built-in video capture (webm → MP4 via ffmpeg).
 *     Fast to produce, but subject to OS scheduling jitter and dropped frames.
 *     Does not know about --video/--slides/--variant — --tab/--duration only.
 *
 * Usage:
 *   node scripts/record-playwright.mjs [options]              (realtime)
 *   node scripts/record-playwright.mjs --frames [options]     (frame-by-frame)
 *   node scripts/record-playwright.mjs --frames --video <id>  (frame-by-frame, declared video)
 *   node scripts/record-playwright.mjs --frames --help        (full frame-mode flag reference)
 *
 * Frame-by-frame ready/stop signals work exactly like record-obs.mjs's (see
 * that file's header): a local HTTP server receives a `/ready` ping once the
 * first frame has actually rendered (query param `ready-port`), and a
 * `/stop-recording` ping once --slides slides have each shown for their full
 * duration (query param `stop-after-slides`) — see scripts/lib/recorder-server.mjs.
 */

import { execFileSync, execSync } from 'child_process';
import { mkdirSync, renameSync, rmSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRecordPlaywrightProgram, createRecordFramesProgram, parseFlags, cliArgv } from './lib/cli-args.mjs';
import { startReadyServer, waitForSignalAndLog, makeTranslationMissingChecker } from './lib/recorder-server.mjs';
import { mixAudioIntoVideo } from './lib/audio-mix.mjs';
import { resolveOptions, MIX_TRANSITION_SFX_AND_BINAURAL } from './record-obs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── shared helpers ───────────────────────────────────────────────────────────

function hasFFmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function fileSizeMb(filePath) {
  try { return (statSync(filePath).size / 1024 / 1024).toFixed(1); }
  catch { return '?'; }
}

// ── frame-by-frame engine ─────────────────────────────────────────────────────

/**
 * Records one job frame-by-frame. `resolved` is the same shape resolveOptions()
 * (from record-obs.mjs) produces — video/format/width/height/fps/slidesCount/
 * durationSec/durationExplicit/baseUrl/tab/noTab/lang/variant/binauralHz/outputDst.
 * Pass a shared `browser` (a launched playwright.chromium instance) across
 * multiple calls — e.g. record-videos.mjs's --engine frames batch — to avoid
 * relaunching Chromium per job; omit it to launch/close one just for this call.
 *
 * @param {object} resolved
 * @param {object} [options]
 * @param {import('playwright').Browser} [options.browser] Shared browser instance
 * @param {number} [options.renderScale] Fraction of full resolution to render at (default 1)
 * @param {boolean} [options.usePng] PNG instead of JPEG for intermediate frames
 * @param {number} [options.jpegQuality] JPEG quality 1-100 (default 92)
 * @param {boolean} [options.keepFrames] Keep the temporary frames directory after encoding
 * @returns {Promise<string>} outputDst
 */
export async function recordFramesOne(resolved, options = {}) {
  const {
    browser: sharedBrowser,
    renderScale = 1,
    usePng = false,
    jpegQuality = 92,
    keepFrames = false,
  } = options;
  const {
    video, width, height, label, fps, durationSec, durationExplicit,
    slidesCount, binauralHz, binauralCarrier, binauralVolume, baseUrl, tab,
    noTab, lang, variant, waitMs, outputDst,
  } = resolved;

  if (!hasFFmpeg()) {
    throw new Error('ffmpeg is required for frame-by-frame mode (winget install Gyan.FFmpeg)');
  }

  const browser = sharedBrowser ?? await (await import('playwright')).chromium.launch({
    headless: true,
    args: [
      '--disable-infobars',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--ignore-gpu-blocklist',
    ],
  });

  const renderWidth = Math.round(width * renderScale);
  const renderHeight = Math.round(height * renderScale);
  const context = await browser.newContext({ viewport: { width: renderWidth, height: renderHeight } });
  const page = await context.newPage();

  console.log('\n══════════════════════════════════════════');
  console.log('  Animation Recorder (Playwright, frame-by-frame)');
  console.log('══════════════════════════════════════════');
  if (video) console.log(`  Video   : ${video.id}  "${video.title}"`);
  if (variant && variant !== 'default') console.log(`  Variant : ${variant}`);
  console.log(`  Format  : ${label}`);
  console.log(`  FPS     : ${fps}`);
  console.log(`  Slides  : ${slidesCount ?? `(fixed ${durationSec}s)`}`);
  console.log(`  Output  : ${outputDst}`);
  console.log('══════════════════════════════════════════\n');

  try {
    // Install the fake clock BEFORE navigation so every timer (RAF, setTimeout,
    // setInterval, performance.now, Date) is under our control from the start.
    await page.clock.install();
    await page.clock.setSystemTime(Date.now());

    const readyServer = await startReadyServer();
    const recordUrl = new URL(noTab ? baseUrl : `${baseUrl}/${tab}`);
    recordUrl.searchParams.set('ready-port', String(readyServer.port));
    if (lang) recordUrl.searchParams.set('lang', lang);
    if (variant && variant !== 'default') recordUrl.searchParams.set('variant', variant);
    if (binauralHz) {
      recordUrl.searchParams.set('binaural-hz', String(binauralHz));
      recordUrl.searchParams.set('binaural-carrier', String(binauralCarrier));
      recordUrl.searchParams.set('binaural-volume', String(binauralVolume));
    }
    if (slidesCount !== undefined) recordUrl.searchParams.set('stop-after-slides', String(slidesCount));
    // Hold the sequence at slide 0 during warm-up below — otherwise slides
    // would advance (and even finish, hitting stop-after-slides) while we're
    // still just waiting for the first mesh to render, before a single frame
    // has been captured. app/preset/[id]/full-window.tsx listens for the same
    // `obsCustomEvent: startSequence` signal record-obs.mjs's --obs-sync emits
    // via the OBS vendor API — dispatched directly from Playwright below
    // instead, since there's no OBS in this engine.
    recordUrl.searchParams.set('pause-until-obs', '1');
    const fullUrl = recordUrl.toString();

    const assertNoTranslationMissing = makeTranslationMissingChecker(readyServer);

    console.log(`Opening ${fullUrl} ...`);
    await page.goto(fullUrl, { waitUntil: 'load', timeout: 30_000 });

    const frameDurationMs = 1000 / fps;

    // Advance the fake clock frame-by-frame (not screenshotting yet) until the
    // page pings /ready — i.e. its first mesh has actually rendered — instead
    // of guessing a fixed fast-forward like this script used to. Bounded by
    // --wait-ms of *fake* time so a page that never pings can't hang forever.
    // The sequence itself is paused (see pause-until-obs above), so this can't
    // burn through slides before recording has even started.
    console.log('Advancing fake clock until first-frame ready signal...');
    const warmupDeadlineMs = waitMs ?? 15_000;
    let warmedMs = 0;
    while (!readyServer.isReady() && warmedMs < warmupDeadlineMs) {
      await page.clock.runFor(frameDurationMs);
      warmedMs += frameDurationMs;
      assertNoTranslationMissing();
    }
    if (!readyServer.isReady()) {
      console.warn(`No ready signal after ${warmupDeadlineMs}ms of fake time — proceeding anyway.`);
    } else {
      console.log(`Ready signal received after ${warmedMs.toFixed(0)}ms of fake time.`);
    }

    // Start the sequence now — recording (frame capture) begins immediately
    // after, so animation and "recording" start on the same frame, same as
    // --obs-sync does for the OBS engine.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('obsCustomEvent', { detail: { action: 'startSequence' } }));
    });

    const framesDir = join(dirname(outputDst), `.frames-${Date.now()}`);
    mkdirSync(framesDir, { recursive: true });
    const frameExt = usePng ? 'png' : 'jpg';

    // Slide-count mode stops on the /stop-recording ping (like record-obs.mjs),
    // capped at durationSec*fps frames only if --duration was explicitly passed
    // (a safety net, not a guess); otherwise capped at a generous absolute
    // ceiling so a page that never stops can't loop forever. Bare-duration mode
    // (no --video/--slides) just captures exactly durationSec*fps frames.
    const ABSOLUTE_SAFETY_FRAMES = 600 * fps; // 10 minutes of video, worst case
    const frameCap = slidesCount !== undefined
      ? (durationExplicit ? Math.ceil(durationSec * fps) : ABSOLUTE_SAFETY_FRAMES)
      : Math.ceil(durationSec * fps);

    console.log(`\n● Recording ${slidesCount !== undefined ? `until stop signal (cap ${frameCap} frames)` : `${frameCap} frames`} @ ${fps} fps...\n`);
    const startWall = Date.now();
    let i = 0;
    for (; i < frameCap; i++) {
      if (slidesCount !== undefined && readyServer.isStopped()) break;

      await page.clock.runFor(frameDurationMs);
      assertNoTranslationMissing();

      const framePath = join(framesDir, `frame-${String(i).padStart(6, '0')}.${frameExt}`);
      await page.screenshot({
        path: framePath,
        type: usePng ? 'png' : 'jpeg',
        ...(usePng ? {} : { quality: jpegQuality }),
      });

      if (i % fps === fps - 1) {
        const elapsed = ((Date.now() - startWall) / 1000).toFixed(1);
        process.stdout.write(`\r  ${Math.floor((i + 1) / fps)}s of animation captured  (wall: ${elapsed}s)   `);
      }
    }
    if (slidesCount !== undefined && !readyServer.isStopped()) {
      console.warn(`\nHit the ${frameCap}-frame safety cap without a stop signal — recording may be cut off.`);
    }
    const totalFrames = i;
    const wallSec = ((Date.now() - startWall) / 1000).toFixed(1);
    console.log(`\n\n${totalFrames} frames captured in ${wallSec}s wall-clock (${(totalFrames / fps).toFixed(1)}s of animation).`);

    const soundLog = readyServer.getSoundLog();
    readyServer.close();
    await context.close();

    mkdirSync(dirname(outputDst), { recursive: true });
    console.log('Encoding MP4...');
    const scaleFilter = renderScale < 1 ? ['-vf', `scale=${width}:${height}:flags=lanczos`] : [];
    execFileSync('ffmpeg', [
      '-y',
      '-framerate', String(fps),
      '-i', join(framesDir, `frame-%06d.${frameExt}`),
      ...scaleFilter,
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-profile:v', 'high',
      '-level', '4.2',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an', // silent — real audio gets mixed in below, same pipeline as record-obs.mjs
      outputDst,
    ], { stdio: 'inherit' });

    if (!keepFrames) rmSync(framesDir, { recursive: true, force: true });
    console.log(`\n✓ Saved: ${outputDst}  (${fileSizeMb(outputDst)} MB)`);

    // The recording itself is silent — mix the background music in now (plus
    // transition SFX/binaural, if MIX_TRANSITION_SFX_AND_BINAURAL is re-enabled
    // in record-obs.mjs — this engine follows that same flag).
    try {
      const mixSoundLog = MIX_TRANSITION_SFX_AND_BINAURAL ? soundLog : { music: soundLog.music, events: [] };
      const mixBinaural = MIX_TRANSITION_SFX_AND_BINAURAL && binauralHz
        ? { hz: binauralHz, carrier: binauralCarrier, volume: binauralVolume }
        : null;
      mixAudioIntoVideo(outputDst, mixSoundLog, mixBinaural);
    } catch (err) {
      console.warn(`Audio mix failed; recording stays silent: ${err.message}`);
    }

    return outputDst;
  } finally {
    await context.close().catch(() => {});
    if (!sharedBrowser) await browser.close();
  }
}

// ── CLI entry ────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function main() {
  const argv = cliArgv();
  if (argv.includes('--frames')) {
    await mainFrames();
  } else {
    await mainRealtime();
  }
}

async function mainFrames() {
  const rawOpts = parseFlags(createRecordFramesProgram(), cliArgv());

  if (rawOpts.video === true || rawOpts.video === 'all') {
    const { runBatch } = await import('./record-videos.mjs');
    const langs = (rawOpts.lang || 'en').split(',').map((s) => s.trim()).filter(Boolean);
    const { results } = await runBatch({
      formats: [rawOpts.format ?? 'shorts'],
      langs,
      engine: 'frames',
      outDir: rawOpts.outDir,
      dryRun: rawOpts.dryRun === true,
      failFast: rawOpts.failFast === true,
      baseOpts: rawOpts,
    });
    if (results.some((r) => !r.ok)) process.exitCode = 1;
    return;
  }

  const resolved = resolveOptions(rawOpts);
  if (rawOpts.dryRun === true) {
    console.log('\n══════════════════════════════════════════');
    console.log('  Animation Recorder (Playwright, frame-by-frame) — DRY RUN');
    console.log('══════════════════════════════════════════');
    if (resolved.video) console.log(`  Video   : ${resolved.video.id}  "${resolved.video.title}"`);
    console.log(`  Format  : ${resolved.label}`);
    console.log(`  FPS     : ${resolved.fps}`);
    console.log(`  Slides  : ${resolved.slidesCount ?? `(fixed ${resolved.durationSec}s)`}`);
    console.log(`  Output  : ${resolved.outputDst}`);
    console.log('══════════════════════════════════════════\n');
    return;
  }

  const renderScale = Math.min(1, Math.max(0.1, parseFloat(rawOpts.scale ?? '1')));
  await recordFramesOne(resolved, {
    renderScale,
    usePng: rawOpts.png === true,
    jpegQuality: parseInt(rawOpts.jpegQuality ?? '92', 10),
    keepFrames: rawOpts.keepFrames === true,
  });
}

// ── realtime engine ───────────────────────────────────────────────────────────

const FORMAT_CONFIGS = {
  yt: { label: 'YouTube 1920x1080', width: 1920, height: 1080, vfilter: 'scale=1920:1080', bitrate: '12M' },
  shorts: { label: 'YouTube Shorts 1080x1920', width: 1080, height: 1920, vfilter: 'scale=1080:1920', bitrate: '12M' },
  'yt-4k': { label: 'YouTube 4K 3840x2160 (upscaled)', width: 1920, height: 1080, vfilter: 'scale=3840:2160:flags=lanczos', bitrate: '48M' },
};

async function mainRealtime() {
  const args = parseFlags(createRecordPlaywrightProgram(), cliArgv());

  const format = args.format ?? 'yt';
  const durationSec = parseInt(args.duration ?? '60', 10);
  const tab = args.tab ?? 'preset/mcon/full-window';
  const lang = args.lang ?? '';
  const baseUrl = args.url ?? 'http://localhost:8081';
  const renderScale = Math.min(1, Math.max(0.1, parseFloat(args.scale ?? '1')));
  const noFfmpeg = args.ffmpeg === false;
  const binauralHz = parseFloat(args.binauralHz ?? '6');
  const binauralCarrier = parseFloat(args.binauralCarrier ?? '200');
  const binauralVolume = parseFloat(args.binauralVolume ?? '0.35');

  const config = FORMAT_CONFIGS[format];
  if (!config) {
    console.error(`Unknown format: "${format}". Available: ${Object.keys(FORMAT_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rawOutput = args.output ?? `recordings/${ts}_animation_${format}.mp4`;
  const outputMp4 = /\.(mp4|mov|mkv|webm)$/i.test(rawOutput) ? rawOutput : `${rawOutput}.mp4`;
  const outputDir = dirname(outputMp4);
  mkdirSync(outputDir, { recursive: true });

  const fullUrl = `${baseUrl}/${tab}${lang ? `?lang=${lang}` : ''}`;

  function ffmpegEncode(inputArg, extraInputArgs, outputPath, audioOpts) {
    const bitrateNum = parseInt(config.bitrate.replace('M', ''), 10);
    const audioInputArgs = audioOpts ? [
      '-f', 'lavfi',
      '-i', [
        'aevalsrc=',
        `${audioOpts.volume}*sin(2*PI*${audioOpts.carrier}*t)`,
        '|',
        `${audioOpts.volume}*sin(2*PI*${audioOpts.carrier + audioOpts.beatHz}*t)`,
        ':c=stereo:s=44100',
      ].join(''),
    ] : [];
    const audioOutputArgs = audioOpts
      ? ['-c:a', 'aac', '-b:a', '192k', '-t', String(audioOpts.durationSec)]
      : ['-an'];
    const ffmpegArgs = [
      '-y', ...extraInputArgs, '-i', inputArg, ...audioInputArgs,
      '-vf', config.vfilter,
      '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level', '4.2',
      '-crf', '18', '-maxrate', config.bitrate, '-bufsize', `${bitrateNum * 2}M`,
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      ...audioOutputArgs, outputPath,
    ];
    console.log(`\nffmpeg ${ffmpegArgs.join(' ')}\n`);
    execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  }

  function binauralOpts() {
    if (!binauralHz) return null;
    return { beatHz: binauralHz, carrier: binauralCarrier, volume: binauralVolume, durationSec };
  }

  console.log('\n══════════════════════════════════════════');
  console.log('  Animation Recorder (Playwright, realtime)');
  console.log('══════════════════════════════════════════');
  console.log(`  Format  : ${config.label}`);
  console.log(`  Duration: ${durationSec}s`);
  console.log(`  URL     : ${fullUrl}`);
  console.log(`  Output  : ${outputMp4}`);
  if (binauralHz) console.log(`  Binaural: ${binauralHz} Hz beat  (${binauralCarrier} Hz / ${binauralCarrier + binauralHz} Hz)  ⚠ headphones required`);
  console.log('══════════════════════════════════════════\n');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-infobars', '--no-first-run', '--disable-blink-features=AutomationControlled', '--ignore-gpu-blocklist'],
  });

  const videoDir = join(__dirname, '../recordings/.playwright-tmp');
  mkdirSync(videoDir, { recursive: true });

  const renderWidth = Math.round(config.width * renderScale);
  const renderHeight = Math.round(config.height * renderScale);
  const context = await browser.newContext({
    viewport: { width: renderWidth, height: renderHeight },
    recordVideo: { dir: videoDir, size: { width: renderWidth, height: renderHeight } },
  });
  const page = await context.newPage();

  const readyServer = await startReadyServer();
  const recordUrl = new URL(fullUrl);
  recordUrl.searchParams.set('ready-port', String(readyServer.port));

  console.log(`Opening ${fullUrl} ...`);
  await page.goto(recordUrl.toString(), { waitUntil: 'load', timeout: 30_000 });

  console.log('Waiting for page ready signal...');
  await waitForSignalAndLog(readyServer.waitForReady, 'page ready', undefined, readyServer);
  readyServer.close();

  console.log(`\n● REC  (${durationSec}s)\n`);
  await page.waitForTimeout(durationSec * 1000);

  console.log('Stopping recording...');
  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  if (noFfmpeg || !hasFFmpeg()) {
    const webmOut = outputMp4.replace(/\.mp4$/, '.webm');
    renameSync(videoPath, webmOut);
    console.log(`\n✓ Saved (webm): ${webmOut}  (${fileSizeMb(webmOut)} MB)`);
    if (!hasFFmpeg()) console.log('  Install ffmpeg for MP4: winget install Gyan.FFmpeg');
  } else {
    console.log('\nConverting webm → MP4...');
    ffmpegEncode(videoPath, [], outputMp4, binauralOpts());
    try { unlinkSync(videoPath); } catch { /* ignore */ }
    console.log(`\n✓ Saved: ${outputMp4}  (${fileSizeMb(outputMp4)} MB)`);
  }
}
