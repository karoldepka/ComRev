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
 *   --duration <seconds>        Recording duration (default: 30)
 *   --tab <path>                App route to open (default: preset/mcon/full-window)
 *   --url <base>                App base URL (default: http://localhost:8081)
 *   --output <path>             Output file path (default: recordings/<timestamp>.<format>.mp4)
 *   --fps <number>              Frames per second (default: 60)
 *   --wait-ms <ms>              Wait after page load before recording starts (default: 3000)
 *   --headless                  Run without a visible browser window
 *   --frames                    Use frame-by-frame mode (clock-controlled, perfect quality)
 *   --no-ffmpeg                 Keep raw output, skip MP4 conversion (realtime: .webm; frames: no-op)
 *   --keep-frames               Keep temporary PNG frames directory after encoding
 */

import { chromium } from 'playwright';
import { execFileSync, execSync } from 'child_process';
import { mkdirSync, renameSync, rmSync, unlinkSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
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
const durationSec = parseInt(args.duration ?? '30', 10);
const tab        = args.tab ?? 'preset/mcon/full-window';
const baseUrl    = args.url ?? 'http://localhost:8081';
const fps        = parseInt(args.fps ?? '60', 10);
const waitMs     = parseInt(args['wait-ms'] ?? '3000', 10);
const headless   = args.headless === true;
const frameMode  = args.frames === true;
const noFfmpeg   = args['no-ffmpeg'] === true;
const keepFrames = args['keep-frames'] === true;

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
    width: 608,
    height: 1080,
    vfilter: 'scale=1080:1920:flags=lanczos',
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
const rawOutput = args.output ?? `recordings/${ts}_animation.${format}`;
const outputMp4 = extname(rawOutput) ? rawOutput : `${rawOutput}.mp4`;
const outputDir = dirname(outputMp4);
mkdirSync(outputDir, { recursive: true });

const fullUrl = `${baseUrl}/${tab}`;

// ── helpers ───────────────────────────────────────────────────────────────────

function hasFFmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function fileSizeMb(filePath) {
  try { return (statSync(filePath).size / 1024 / 1024).toFixed(1); }
  catch { return '?'; }
}

function ffmpegEncode(inputArg, extraInputArgs, outputPath) {
  const bitrateNum = parseInt(config.bitrate.replace('M', ''), 10);
  const ffmpegArgs = [
    '-y',
    ...extraInputArgs,
    '-i', inputArg,
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
    '-an',
    outputPath,
  ];
  console.log(`\nffmpeg ${ffmpegArgs.join(' ')}\n`);
  execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
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
if (frameMode) {
  const totalFrames = Math.ceil(durationSec * fps);
  console.log(`  Frames  : ${totalFrames} PNGs → MP4`);
}
console.log('══════════════════════════════════════════\n');

// ── launch browser ────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  headless,
  args: [
    '--disable-infobars',
    '--no-first-run',
    '--disable-blink-features=AutomationControlled',
  ],
});

// ── frame-by-frame mode ───────────────────────────────────────────────────────

if (frameMode) {
  if (!hasFFmpeg()) {
    console.error('ffmpeg is required for frame-by-frame mode (winget install Gyan.FFmpeg)');
    await browser.close();
    process.exit(1);
  }

  const framesDir = join(outputDir, `.frames-${ts}`);
  mkdirSync(framesDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
  });
  const page = await context.newPage();

  console.log(`Opening ${fullUrl} ...`);
  await page.goto(fullUrl, { waitUntil: 'load', timeout: 30_000 });

  console.log(`Waiting ${waitMs}ms for animation to initialize...`);
  await page.waitForTimeout(waitMs);

  // Freeze the browser clock.  From this point on, time only advances when
  // we call page.clock.tick().  requestAnimationFrame, performance.now,
  // Date.now, setTimeout and setInterval are all controlled by the fake clock.
  await page.clock.install({ now: Date.now() });

  // Allow one real event-loop turn so any pending real RAF fires and
  // re-registers itself under the fake clock.
  await page.waitForTimeout(50);

  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;

  console.log(`\n● Recording ${totalFrames} frames @ ${fps} fps...\n`);
  const startWall = Date.now();

  for (let i = 0; i < totalFrames; i++) {
    // Advance fake time by exactly one frame → fires the pending RAF callback
    // inside THREE.js, which recomputes delta from performance.now() and renders.
    await page.clock.tick(frameDurationMs);

    const framePath = join(framesDir, `frame-${String(i).padStart(6, '0')}.png`);
    await page.screenshot({ path: framePath, type: 'png' });

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

  console.log('\n\nEncoding MP4...');
  await context.close();
  await browser.close();

  ffmpegEncode(
    join(framesDir, 'frame-%06d.png'),
    ['-framerate', String(fps)],
    outputMp4,
  );

  if (!keepFrames) {
    rmSync(framesDir, { recursive: true, force: true });
  } else {
    console.log(`Frames kept at: ${framesDir}`);
  }

  console.log(`\n✓ Saved: ${outputMp4}  (${fileSizeMb(outputMp4)} MB)`);

// ── realtime mode ─────────────────────────────────────────────────────────────

} else {
  const videoDir = join(__dirname, '../recordings/.playwright-tmp');
  mkdirSync(videoDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    recordVideo: {
      dir: videoDir,
      size: { width: config.width, height: config.height },
    },
  });
  const page = await context.newPage();

  console.log(`Opening ${fullUrl} ...`);
  await page.goto(fullUrl, { waitUntil: 'load', timeout: 30_000 });

  console.log(`Waiting ${waitMs}ms for animation to settle...`);
  await page.waitForTimeout(waitMs);

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
    ffmpegEncode(videoPath, ['-r', String(fps)], outputMp4);
    try { unlinkSync(videoPath); } catch { /* ignore */ }
    console.log(`\n✓ Saved: ${outputMp4}  (${fileSizeMb(outputMp4)} MB)`);
  }
}
