#!/usr/bin/env node
/**
 * Screen recorder using Playwright.
 *
 * Two modes:
 *
 *   realtime (default)
 *     Records using Playwright's built-in video capture (webm → MP4 via ffmpeg).
 *     Fast to produce, but subject to OS scheduling jitter and dropped frames.
 *
 *   frame-by-frame  (--frames)
 *     Pauses the browser clock after page load, then advances it by exactly
 *     1/fps seconds per iteration, screenshots the canvas, and stitches frames
 *     into MP4 via ffmpeg.  THREE.js sees perfectly uniform performance.now()
 *     deltas → zero jitter, zero dropped frames, correct motion blur.
 *     Slower to produce (one screenshot per frame) but pixel-perfect output.
 *
 * Usage:
 *   node scripts/record-playwright.mjs [options]
 *
 * Options:
 *   --format yt|shorts|yt-4k   Output format (default: yt)
 *   --duration <seconds>        Recording duration (default: 60)
 *   --tab <path>                App route to open (default: preset/mcon/full-window)
 *   --url <base>                App base URL (default: http://localhost:8081)
 *   --output <path>             Output file path (default: recordings/<timestamp>.<format>.mp4)
 *   --fps <number>              Frames per second (default: 60)
 *   --wait-ms <ms>              Frame-by-frame mode only: how much fake time to fast-forward
 *                               through before recording starts (default: 3000). Realtime mode
 *                               doesn't use this — see "Ready signal" below.
 *   --headless                  Run without a visible browser window
 *   --headed                    Force a visible browser window (frame mode defaults to headless for speed)
 *   --frames                    Use frame-by-frame mode (clock-controlled, perfect quality)
 *   --png                       Use PNG for intermediate frames instead of JPEG (slower but lossless)
 *   --jpeg-quality <1-100>      JPEG quality for intermediate frames (default: 92)
 *   --no-ffmpeg                 Keep raw output, skip MP4 conversion (realtime: .webm; frames: no-op)
 *   --keep-frames               Keep temporary frame files directory after encoding
 *   --binaural-hz <number>      Add binaural beat audio track at this frequency in Hz (default: 6).
 *                               Requires headphones to work. Use 0 to disable.
 *   --binaural-carrier <number> Carrier sine frequency in Hz (default: 200)
 *   --binaural-volume <0-1>     Binaural tone amplitude (default: 0.35)
 *   --scale <0.1-1>             Render at this fraction of full resolution, then upscale in ffmpeg.
 *                               Use 0.5 for ~4x faster test renders. (default: 1)
 *
 * Ready signal (realtime mode only):
 *   This script starts a tiny local HTTP server and appends a `ready-port` query
 *   param to the app URL. app/preset/[id]/full-window.tsx pings it — via
 *   navigator.sendBeacon — the moment the first 3D frame has actually rendered,
 *   so recording starts exactly on cue instead of guessing a wait time. This
 *   script only ever records this app's own routes, so the ping is guaranteed
 *   eventually — recording waits for it with no timeout (a guessed fallback that
 *   starts recording anyway would defeat the point). Frame-by-frame mode doesn't
 *   need this — it fast-forwards a fake clock instead of waiting on wall-clock time.
 */

import { execFileSync, execSync } from 'child_process';
import { mkdirSync, renameSync, rmSync, unlinkSync, statSync } from 'fs';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
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

const format     = args.format ?? 'yt';
const durationSec = parseInt(args.duration ?? '60', 10);
const tab        = args.tab ?? 'preset/mcon/full-window';
const lang       = args.lang ?? '';
const baseUrl    = args.url ?? 'http://localhost:8081';
const fps        = parseInt(args.fps ?? '60', 10);
const waitMs     = parseInt(args['wait-ms'] ?? '3000', 10);
const frameMode       = args.frames === true;
const forceHeadless   = args.headless === true;
const forceHeaded     = args.headed === true;
const headless        = forceHeaded ? false : (forceHeadless || frameMode);
const usePng          = args.png === true;
const jpegQuality     = parseInt(args['jpeg-quality'] ?? '92', 10);
const noFfmpeg        = args['no-ffmpeg'] === true;
const keepFrames      = args['keep-frames'] === true;
const binauralHz      = parseFloat(args['binaural-hz'] ?? '6');
const binauralCarrier = parseFloat(args['binaural-carrier'] ?? '200');
const binauralVolume  = parseFloat(args['binaural-volume'] ?? '0.35');
const renderScale     = Math.min(1, Math.max(0.1, parseFloat(args.scale ?? '1')));

// ── format config ─────────────────────────────────────────────────────────────

const FORMAT_CONFIGS = {
  yt: {
    label: 'YouTube 1920x1080',
    width: 1920,
    height: 1080,
    vfilter: 'scale=1920:1080',
    bitrate: '12M',
  },
  shorts: {
    label: 'YouTube Shorts 1080x1920',
    width: 1080,
    height: 1920,
    vfilter: 'scale=1080:1920',
    bitrate: '12M',
  },
  'yt-4k': {
    label: 'YouTube 4K 3840x2160 (upscaled)',
    width: 1920,
    height: 1080,
    vfilter: 'scale=3840:2160:flags=lanczos',
    bitrate: '48M',
  },
};

const config = FORMAT_CONFIGS[format];
if (!config) {
  console.error(`Unknown format: "${format}". Available: ${Object.keys(FORMAT_CONFIGS).join(', ')}`);
  process.exit(1);
}

// ── output paths ──────────────────────────────────────────────────────────────

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const rawOutput = args.output ?? `recordings/${ts}_animation_${format}.mp4`;
const outputMp4 = /\.(mp4|mov|mkv|webm)$/i.test(rawOutput) ? rawOutput : `${rawOutput}.mp4`;
const outputDir = dirname(outputMp4);
mkdirSync(outputDir, { recursive: true });

const fullUrl = `${baseUrl}/${tab}${lang ? `?lang=${lang}` : ''}`;

// ── helpers ───────────────────────────────────────────────────────────────────

function hasFFmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

/** Tiny local HTTP server the recorded page can ping (see "Ready signal" above) once its first frame renders. */
function startReadyServer() {
  return new Promise((resolveSetup) => {
    let resolveReady;
    const ready = new Promise((resolve) => { resolveReady = resolve; });
    const server = createServer((req, res) => {
      res.writeHead(204);
      res.end();
      if (req.url?.startsWith('/ready')) resolveReady();
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolveSetup({ port, ready, close: () => server.close() });
    });
  });
}

function fileSizeMb(filePath) {
  try { return (statSync(filePath).size / 1024 / 1024).toFixed(1); }
  catch { return '?'; }
}

// audioOpts: { beatHz, carrier, volume, durationSec } or null for no audio
function ffmpegEncode(inputArg, extraInputArgs, outputPath, audioOpts = null, outputFps = null) {
  const bitrateNum = parseInt(config.bitrate.replace('M', ''), 10);

  // Left ear: carrier Hz  |  Right ear: carrier + beatHz
  // The brain perceives the difference as a binaural beat at beatHz.
  const audioInputArgs = audioOpts ? [
    '-f', 'lavfi',
    '-i', [
      `aevalsrc=`,
      `${audioOpts.volume}*sin(2*PI*${audioOpts.carrier}*t)`,
      `|`,
      `${audioOpts.volume}*sin(2*PI*${audioOpts.carrier + audioOpts.beatHz}*t)`,
      `:c=stereo:s=44100`,
    ].join(''),
  ] : [];

  const audioOutputArgs = audioOpts
    ? ['-c:a', 'aac', '-b:a', '192k', '-t', String(audioOpts.durationSec)]
    : ['-an'];

  const ffmpegArgs = [
    '-y',
    ...extraInputArgs,
    '-i', inputArg,
    ...audioInputArgs,
    '-vf', config.vfilter,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-profile:v', 'high',
    '-level', '4.2',
    '-crf', '18',
    '-maxrate', config.bitrate,
    '-bufsize', `${bitrateNum * 2}M`,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    ...(outputFps ? ['-r', String(outputFps)] : []),
    ...audioOutputArgs,
    outputPath,
  ];
  console.log(`\nffmpeg ${ffmpegArgs.join(' ')}\n`);
  execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
}

function binauralOpts() {
  if (!binauralHz) return null;
  return { beatHz: binauralHz, carrier: binauralCarrier, volume: binauralVolume, durationSec };
}

// ── banner ────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════');
console.log('  Animation Recorder (Playwright)');
console.log('══════════════════════════════════════════');
console.log(`  Mode    : ${frameMode ? 'frame-by-frame (clock-controlled)' : 'realtime'}`);
console.log(`  Format  : ${config.label}`);
console.log(`  FPS     : ${fps}`);
console.log(`  Duration: ${durationSec}s`);
console.log(`  URL     : ${fullUrl}`);
console.log(`  Output  : ${outputMp4}`);
console.log(`  Browser : ${headless ? 'headless' : 'headed'}`);
if (frameMode) {
  const totalFrames = Math.ceil(durationSec * fps);
  const frameFormat = usePng ? 'PNG' : `JPEG q${jpegQuality}`;
  console.log(`  Frames  : ${totalFrames} ${frameFormat} → MP4`);
}
if (renderScale < 1) {
  const rw = Math.round(config.width * renderScale);
  const rh = Math.round(config.height * renderScale);
  console.log(`  Scale   : ${renderScale} (render ${rw}×${rh}, upscale in ffmpeg)`);
}
if (binauralHz) {
  console.log(`  Binaural: ${binauralHz} Hz beat  (${binauralCarrier} Hz / ${binauralCarrier + binauralHz} Hz)  ⚠ headphones required`);
}
console.log('══════════════════════════════════════════\n');

// ── launch browser ────────────────────────────────────────────────────────────

let playwrightMod;
try {
  playwrightMod = await import('playwright');
} catch {
  console.error(
    'Playwright is not installed. Run:\n' +
    '  npm install --save-dev playwright\n' +
    '  npx playwright install chromium',
  );
  process.exit(1);
}
const { chromium } = playwrightMod;

const browser = await chromium.launch({
  headless,
  args: [
    '--disable-infobars',
    '--no-first-run',
    '--disable-blink-features=AutomationControlled',
    '--ignore-gpu-blocklist',
  ],
});

// ── frame-by-frame mode ───────────────────────────────────────────────────────

if (frameMode) {
  if (!noFfmpeg && !hasFFmpeg()) {
    console.error('ffmpeg is required for frame-by-frame mode (winget install Gyan.FFmpeg)');
    await browser.close();
    process.exit(1);
  }

  const framesDir = join(outputDir, `.frames-${ts}`);
  mkdirSync(framesDir, { recursive: true });

  const renderWidth  = Math.round(config.width  * renderScale);
  const renderHeight = Math.round(config.height * renderScale);
  const context = await browser.newContext({
    viewport: { width: renderWidth, height: renderHeight },
  });
  const page = await context.newPage();

  // Install the fake clock BEFORE navigation so every timer (RAF, setTimeout,
  // setInterval, performance.now, Date) is under our control from the start.
  // setSystemTime sets the starting timestamp without firing any callbacks.
  await page.clock.install();
  await page.clock.setSystemTime(Date.now());

  console.log(`Opening ${fullUrl} ...`);
  await page.goto(fullUrl, { waitUntil: 'load', timeout: 30_000 });

  // Jump the fake clock forward through the init period without firing any
  // intermediate callbacks (no 180 THREE.js renders before recording starts).
  // Slide timers registered during page load will still fire at the correct
  // fake time during recording because their scheduled time is now in our past.
  console.log(`Fast-forwarding ${waitMs}ms of fake time for initialization...`);
  await page.clock.fastForward(waitMs);

  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;

  console.log(`\n● Recording ${totalFrames} frames @ ${fps} fps...\n`);
  const startWall = Date.now();

  for (let i = 0; i < totalFrames; i++) {
    // Advance fake time by one frame.  Fires the pending RAF (THREE.js renders)
    // and any setTimeout/setInterval callbacks due in this window (slide changes,
    // sequence timers, etc.) — all perfectly in sync with the video clock.
    await page.clock.runFor(frameDurationMs);

    const ext = usePng ? 'png' : 'jpg';
    const framePath = join(framesDir, `frame-${String(i).padStart(6, '0')}.${ext}`);
    await page.screenshot({
      path: framePath,
      type: usePng ? 'png' : 'jpeg',
      ...(usePng ? {} : { quality: jpegQuality }),
    });

    // Progress line every second of animation time
    if (i % fps === fps - 1 || i === totalFrames - 1) {
      const elapsed = ((Date.now() - startWall) / 1000).toFixed(0);
      const animSec  = Math.floor((i + 1) / fps);
      const eta      = i < totalFrames - 1
        ? ` ETA ~${Math.ceil(((Date.now() - startWall) / (i + 1)) * (totalFrames - i - 1) / 1000)}s`
        : '';
      process.stdout.write(`\r  ${animSec}s / ${durationSec}s  (wall: ${elapsed}s${eta})   `);
    }
  }

  console.log('\n');
  await context.close();
  await browser.close();

  if (noFfmpeg) {
    console.log(`Frames saved at: ${framesDir}`);
    console.log('Skipping MP4 encoding because --no-ffmpeg was passed.');
  } else {
    console.log('Encoding MP4...');
    const frameExt = usePng ? 'png' : 'jpg';
    ffmpegEncode(
      join(framesDir, `frame-%06d.${frameExt}`),
      ['-framerate', String(fps)],
      outputMp4,
      binauralOpts(),
      fps,
    );

    if (!keepFrames) {
      rmSync(framesDir, { recursive: true, force: true });
    } else {
      console.log(`Frames kept at: ${framesDir}`);
    }

    console.log(`\n✓ Saved: ${outputMp4}  (${fileSizeMb(outputMp4)} MB)`);
  }

// ── realtime mode ─────────────────────────────────────────────────────────────

} else {
  const videoDir = join(__dirname, '../recordings/.playwright-tmp');
  mkdirSync(videoDir, { recursive: true });

  const renderWidth  = Math.round(config.width  * renderScale);
  const renderHeight = Math.round(config.height * renderScale);
  const context = await browser.newContext({
    viewport: { width: renderWidth, height: renderHeight },
    recordVideo: {
      dir: videoDir,
      size: { width: renderWidth, height: renderHeight },
    },
  });
  const page = await context.newPage();

  const readyServer = await startReadyServer();
  const recordUrl = new URL(fullUrl);
  recordUrl.searchParams.set('ready-port', String(readyServer.port));

  console.log(`Opening ${fullUrl} ...`);
  await page.goto(recordUrl.toString(), { waitUntil: 'load', timeout: 30_000 });

  // This script only ever records this app's own routes (no third-party URL
  // mode), so the page is guaranteed to ping eventually — wait for it rather
  // than racing a guessed timeout that would just start recording too early.
  console.log('Waiting for page ready signal...');
  let elapsedSec = 0;
  const heartbeat = setInterval(() => {
    elapsedSec += 5;
    console.log(`  ...still waiting for page ready signal (${elapsedSec}s elapsed). Is the dev server running?`);
  }, 5000);
  await readyServer.ready;
  clearInterval(heartbeat);
  readyServer.close();
  console.log('Page signalled ready.');

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
