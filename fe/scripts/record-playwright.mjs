#!/usr/bin/env node
/**
 * Screen recorder using Playwright's built-in video capture.
 * Records the app in a headed Chromium window (GPU-accelerated WebGL),
 * then optionally converts the webm output to MP4 via ffmpeg.
 *
 * Usage:
 *   node scripts/record-playwright.mjs [options]
 *
 * Options:
 *   --format yt|shorts|yt-4k   Output format (default: yt)
 *   --duration <seconds>        Recording duration (default: 30)
 *   --tab <path>                App route to open (default: preset/mcon/full-window)
 *   --url <base>                App base URL (default: http://localhost:8081)
 *   --output <path>             Output file path (default: recordings/<timestamp>.mp4)
 *   --fps <number>              Output FPS for ffmpeg pass (default: 60)
 *   --wait-ms <ms>              Wait after page load before recording (default: 3000)
 *   --headless                  Run browser without visible window
 *   --no-ffmpeg                 Keep raw .webm output, skip MP4 conversion
 */

import { chromium } from 'playwright';
import { execFileSync, execSync } from 'child_process';
import { mkdirSync, renameSync, unlinkSync, statSync } from 'fs';
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

const format = args.format ?? 'yt';
const durationSec = parseInt(args.duration ?? '30', 10);
const tab = args.tab ?? 'preset/mcon/full-window';
const baseUrl = args.url ?? 'http://localhost:8081';
const fps = parseInt(args.fps ?? '60', 10);
const waitMs = parseInt(args['wait-ms'] ?? '3000', 10);
const headless = args.headless === true;
const noFfmpeg = args['no-ffmpeg'] === true;

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

// ── output path ───────────────────────────────────────────────────────────────

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const rawOutput = args.output ?? `recordings/${ts}_animation.${format}`;
const outputMp4 = extname(rawOutput) ? rawOutput : `${rawOutput}.mp4`;
const outputDir = dirname(outputMp4);
mkdirSync(outputDir, { recursive: true });

const videoDir = join(__dirname, '../recordings/.playwright-tmp');
mkdirSync(videoDir, { recursive: true });

const fullUrl = `${baseUrl}/${tab}`;

// ── helpers ───────────────────────────────────────────────────────────────────

function hasFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function fileSizeMb(filePath) {
  try {
    return (statSync(filePath).size / 1024 / 1024).toFixed(1);
  } catch {
    return '?';
  }
}

// ── banner ────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════');
console.log('  Animation Recorder (Playwright)');
console.log('══════════════════════════════════════════');
console.log(`  Format  : ${config.label}`);
console.log(`  FPS     : ${fps}`);
console.log(`  Duration: ${durationSec}s`);
console.log(`  URL     : ${fullUrl}`);
console.log(`  Output  : ${outputMp4}`);
console.log(`  Headless: ${headless}`);
console.log('══════════════════════════════════════════\n');

// ── record ────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  headless,
  args: [
    '--disable-infobars',
    '--no-first-run',
    '--disable-blink-features=AutomationControlled',
  ],
});

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

// ── post-process ──────────────────────────────────────────────────────────────

const useFFmpeg = !noFfmpeg && hasFFmpeg();

if (!useFFmpeg) {
  const webmOut = outputMp4.replace(/\.mp4$/, '.webm');
  renameSync(videoPath, webmOut);
  console.log(`\n✓ Saved (webm): ${webmOut}  (${fileSizeMb(webmOut)} MB)`);
  console.log('  Install ffmpeg to get MP4 output: winget install Gyan.FFmpeg');
} else {
  const bitrateNum = parseInt(config.bitrate.replace('M', ''), 10);
  const ffmpegArgs = [
    '-y',
    '-i', videoPath,
    '-vf', config.vfilter,
    '-r', String(fps),
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
    outputMp4,
  ];

  console.log('\nConverting webm → MP4...');
  console.log(`ffmpeg ${ffmpegArgs.join(' ')}\n`);

  execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });

  try { unlinkSync(videoPath); } catch { /* ignore */ }

  console.log(`\n✓ Saved: ${outputMp4}  (${fileSizeMb(outputMp4)} MB)`);
}
