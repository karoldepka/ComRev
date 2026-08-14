#!/usr/bin/env node
/**
 * Batch recorder for declared videos — produces one recording per combination
 * of video × format × language, using each video's own principle count so
 * recording stops exactly on its last slide (record-obs.mjs's --slides),
 * instead of guessing a fixed --duration.
 *
 * Video definitions are loaded directly from utils/slides/videos.data.tsx, so
 * newly declared videos are picked up automatically.
 *
 * Usage:
 *   node scripts/record-videos.mjs [options]
 *
 * Filters (comma-separated values or omit for all):
 *   --ids       <list>   smarter-7,habits-7        (default: all declared videos)
 *   --formats   <list>   shorts,yt,yt-4k,tiktok    (default: shorts,yt)
 *   --langs     <list>   en,pl,de,fr,...            (default: en,pl)
 *
 * Batch control:
 *   --dry-run                    Print plan without recording
 *   --out-dir   <path>           Output directory (default: ../recordings/videos_<ts>);
 *                                 files are saved as <lang>/<format>/<video title>.mp4
 *   --continue-on-error          Keep going after a failed recording (default: true)
 *   --fail-fast                  Stop on first error
 *
 * Pass-through flags (forwarded to record-obs.mjs — see its own --help-equivalent
 * header comment): --duration, --fps, --obs-sync, --url, --binaural-hz,
 * --binaural-carrier, --binaural-volume, --ws-url, --ws-password, --no-resize,
 * --scene, --source, ...
 *
 * Examples:
 *   # All videos × shorts+yt × English + Polish (default)
 *   node scripts/record-videos.mjs
 *
 *   # Just the "smarter" video, TikTok format, dry run
 *   node scripts/record-videos.mjs --ids smarter-7 --formats tiktok --dry-run
 *
 *   # All videos, all formats, Polish + English
 *   node scripts/record-videos.mjs --formats shorts,yt,yt-4k,tiktok --langs en,pl
 */

import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadVideos, fileNameFromTitle } from './lib/videos-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── video definitions ───────────────────────────────────────────────────────

const VIDEOS = loadVideos();
const ALL_IDS = VIDEOS.map((v) => v.id);

const ALL_FORMATS = ['shorts', 'yt', 'tiktok', 'yt-4k'];

const ALL_LANGS = [
  'en', 'pl', 'de', 'it', 'fr', 'ca', 'zh', 'pt', 'es', 'hi', 'ar',
];

// ── arg parsing ───────────────────────────────────────────────────────────────

/** Args consumed by this script; everything else is forwarded to record-obs.mjs. */
const BATCH_KEYS = new Set([
  'ids', 'formats', 'langs', 'dry-run', 'out-dir',
  'continue-on-error', 'fail-fast',
]);

function parseArgs(argv) {
  const batch = {};
  const passthrough = [];   // raw tokens for the recorder
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    if (BATCH_KEYS.has(key)) {
      batch[key] = hasValue ? next : true;
      if (hasValue) i++;
    } else {
      passthrough.push(arg);
      if (hasValue) { passthrough.push(next); i++; }
    }
  }
  return { batch, passthrough };
}

function splitList(value, allowed, defaultValue = allowed) {
  if (!value || value === true) return defaultValue;
  const items = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = items.filter((v) => !allowed.includes(v));
  if (unknown.length) {
    console.error(`Unknown value(s): ${unknown.join(', ')}`);
    console.error(`Allowed: ${allowed.join(', ')}`);
    process.exit(1);
  }
  return items;
}

const { batch, passthrough } = parseArgs(process.argv.slice(2));

const ids     = splitList(batch.ids, ALL_IDS);
const videos  = VIDEOS.filter((v) => ids.includes(v.id));
const formats = splitList(batch.formats, ALL_FORMATS, ['shorts', 'yt']);
const langs   = splitList(batch.langs, ALL_LANGS, ['en', 'pl']);
const dryRun  = batch['dry-run'] === true;
const failFast = batch['fail-fast'] === true;

const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(__dirname, '..', batch['out-dir'] ?? `../recordings/videos_${ts}`);
const recorderScript = resolve(__dirname, 'record-obs.mjs');

// ── build job list ────────────────────────────────────────────────────────────

const jobs = [];
videos.forEach((video, videoIndex) => {
  const filename = `${fileNameFromTitle(video.title)}.mp4`;
  for (const format of formats) {
    for (const lang of langs) {
      jobs.push({
        id: video.id,
        videoIndex: videoIndex + 1,
        videoTotal: videos.length,
        slides: video.principleCount + 1, // + the title card
        format,
        lang,
        filename,
        output: `${outDir}/${lang}/${format}/${filename}`,
      });
    }
  }
});

const total = jobs.length;

// ── banner ────────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
console.log('\n══════════════════════════════════════════════════════════');
console.log('  Video Batch Recorder');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Videos   : ${ids.join(', ')}`);
console.log(`  Formats  : ${formats.join(', ')}`);
console.log(`  Languages: ${langs.join(', ')}`);
console.log(`  Total    : ${total} recording${total === 1 ? '' : 's'}`);
console.log(`  Out dir  : ${outDir}`);
if (dryRun) console.log('\n  *** DRY RUN — no recordings will be made ***');
if (passthrough.length) console.log(`  Passthru : ${passthrough.join(' ')}`);
console.log('══════════════════════════════════════════════════════════\n');

if (dryRun) {
  console.log('Plan:\n');
  jobs.forEach((j, i) =>
    console.log(`  ${String(i + 1).padStart(3)}. video ${j.videoIndex} of ${j.videoTotal}  ${pad(j.id, 20)} ${pad(j.lang, 5)} ${pad(j.format, 8)} slides=${j.slides}  → ${j.filename}`),
  );
  console.log('');
  process.exit(0);
}

// ── run jobs ──────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const results = [];
const wallStart = Date.now();

for (let i = 0; i < jobs.length; i++) {
  const { id, videoIndex, videoTotal, slides, format, lang, output } = jobs[i];
  const jobNum = `[${i + 1}/${total}]`;

  // Estimate time remaining from average wall-time of completed jobs
  let etaStr = '';
  if (i > 0) {
    const avgMs = (Date.now() - wallStart) / i;
    const etaSec = Math.ceil((avgMs * (total - i)) / 1000);
    const etaMin = Math.floor(etaSec / 60);
    etaStr = `  ETA ~${etaMin > 0 ? `${etaMin}m ` : ''}${etaSec % 60}s`;
  }

  console.log(`\n${'─'.repeat(62)}`);
  console.log(`${jobNum} video ${videoIndex} of ${videoTotal}  id=${id}  format=${format}  lang=${lang}  slides=${slides}${etaStr}`);
  console.log(`${'─'.repeat(62)}`);

  const args = [
    recorderScript,
    '--tab',    `preset/video-${id}/full-window`,
    '--format', format,
    '--lang',   lang,
    '--slides', String(slides),
    '--output', output,
    ...passthrough,
  ];

  const result = spawnSync('node', args, { stdio: 'inherit' });

  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? `exit ${result.status}`;
    console.error(`\n✗ FAILED ${jobNum}: ${reason}`);
    results.push({ ...jobs[i], ok: false, reason });
    if (failFast) {
      console.error('Stopping (--fail-fast).');
      break;
    }
  } else {
    console.log(`\n✓ Done    ${jobNum}`);
    results.push({ ...jobs[i], ok: true });
  }
}

// ── summary ───────────────────────────────────────────────────────────────────

const wallSec = ((Date.now() - wallStart) / 1000).toFixed(0);
const passed  = results.filter((r) => r.ok).length;
const failed  = results.filter((r) => !r.ok).length;

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Batch complete');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Done in : ${Math.floor(wallSec / 60)}m ${wallSec % 60}s`);
console.log(`  Success : ${passed} / ${total}`);
if (failed) {
  console.log(`  Failed  : ${failed}`);
  results.filter((r) => !r.ok).forEach((r) =>
    console.log(`    ✗ ${r.id}_${r.format}_${r.lang}  — ${r.reason}`),
  );
}
console.log(`  Output  : ${outDir}`);
console.log('══════════════════════════════════════════════════════════\n');

process.exit(failed ? 1 : 0);
