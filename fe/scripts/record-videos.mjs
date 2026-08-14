#!/usr/bin/env node
/**
 * Batch recorder for declared videos — produces one recording per combination
 * of video × format × language, using each video's own principle count so
 * recording stops exactly on its last slide (record-obs.mjs's --slides),
 * instead of guessing a fixed --duration.
 *
 * All jobs in a batch share a single OBS WebSocket connection (see runBatch
 * below) instead of opening a new one per video.
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
 * Pass-through flags (forwarded to record-obs.mjs — see lib/cli-args.mjs's
 * createRecordObsProgram for the full list): --duration, --fps, --obs-sync,
 * --url, --binaural-hz, --binaural-carrier, --binaural-volume, --ws-url,
 * --ws-password, --no-resize, --scene, --source, ...
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

import { mkdirSync } from 'fs';
import { Command } from 'commander';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadVideos, fileNameFromTitle, titleForLang } from './lib/videos-data.mjs';
import { createRecordObsProgram, parseFlags } from './lib/cli-args.mjs';
import { connectObs, recordOne, resolveOptions } from './record-obs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_FORMATS = ['shorts', 'yt', 'tiktok', 'yt-4k'];

const ALL_LANGS = [
  'en', 'pl', 'de', 'it', 'fr', 'ca', 'zh', 'pt', 'es', 'hi', 'ar',
];

function splitList(value, allowed, defaultValue = allowed) {
  if (!value) return defaultValue;
  const items = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = items.filter((v) => !allowed.includes(v));
  if (unknown.length) {
    console.error(`Unknown value(s): ${unknown.join(', ')}`);
    console.error(`Allowed: ${allowed.join(', ')}`);
    process.exit(1);
  }
  return items;
}

const pad = (s, n) => String(s).padEnd(n);

/**
 * Records every combination of the given videos × formats × langs, sharing a
 * single OBS connection across the whole batch.
 *
 * @param {object} options
 * @param {string[]} [options.ids] video ids to include (default: all declared videos)
 * @param {string[]} [options.formats] (default: ['shorts', 'yt'])
 * @param {string[]} [options.langs] (default: ['en', 'pl'])
 * @param {boolean} [options.dryRun]
 * @param {string} [options.outDir]
 * @param {boolean} [options.failFast]
 * @param {object} [options.baseOpts] Commander-opts-shaped object (as returned
 *   by createRecordObsProgram()'s .opts()) providing shared per-recording
 *   settings (fps, binaural, ws-url, ...) — video/format/lang/output are
 *   overridden per job.
 * @returns {Promise<{ jobs: object[], results: object[] }>}
 */
export async function runBatch(options = {}) {
  const {
    ids,
    formats = ['shorts', 'yt'],
    langs = ['en', 'pl'],
    dryRun = false,
    outDir: outDirOpt,
    failFast = false,
    baseOpts = {},
  } = options;

  const allVideos = loadVideos();
  const videos = ids ? allVideos.filter((v) => ids.includes(v.id)) : allVideos;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resolve(__dirname, '..', outDirOpt ?? `../recordings/videos_${ts}`);

  const jobs = [];
  videos.forEach((video, videoIndex) => {
    for (const format of formats) {
      for (const lang of langs) {
        // Filename tracks the language being recorded, not always the English title.
        const filename = `${fileNameFromTitle(titleForLang(video.title, lang))}.mp4`;
        jobs.push({
          id: video.id,
          videoIndex: videoIndex + 1,
          videoTotal: videos.length,
          slides: video.principleCount + 1, // + the title card; display only, resolveOptions derives its own
          format,
          lang,
          filename,
          output: `${outDir}/${lang}/${format}/${filename}`,
        });
      }
    }
  });

  const total = jobs.length;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Video Batch Recorder');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Videos   : ${videos.map((v) => v.id).join(', ')}`);
  console.log(`  Formats  : ${formats.join(', ')}`);
  console.log(`  Languages: ${langs.join(', ')}`);
  console.log(`  Total    : ${total} recording${total === 1 ? '' : 's'}`);
  console.log(`  Out dir  : ${outDir}`);
  if (dryRun) console.log('\n  *** DRY RUN — no recordings will be made ***');
  console.log('══════════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('Plan:\n');
    jobs.forEach((j, i) =>
      console.log(`  ${String(i + 1).padStart(3)}. video ${j.videoIndex} of ${j.videoTotal}  ${pad(j.id, 20)} ${pad(j.lang, 5)} ${pad(j.format, 8)} slides=${j.slides}  → ${j.filename}`),
    );
    console.log('');
    return { jobs, results: [] };
  }

  mkdirSync(outDir, { recursive: true });

  const obs = await connectObs(baseOpts.wsUrl ?? 'ws://localhost:4455', baseOpts.wsPassword ?? '');

  const results = [];
  const wallStart = Date.now();

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const jobNum = `[${i + 1}/${total}]`;

      let etaStr = '';
      if (i > 0) {
        const avgMs = (Date.now() - wallStart) / i;
        const etaSec = Math.ceil((avgMs * (total - i)) / 1000);
        const etaMin = Math.floor(etaSec / 60);
        etaStr = `  ETA ~${etaMin > 0 ? `${etaMin}m ` : ''}${etaSec % 60}s`;
      }

      console.log(`\n${'─'.repeat(62)}`);
      console.log(`${jobNum} video ${job.videoIndex} of ${job.videoTotal}  id=${job.id}  format=${job.format}  lang=${job.lang}  slides=${job.slides}${etaStr}`);
      console.log(`${'─'.repeat(62)}`);

      try {
        const resolved = resolveOptions({
          ...baseOpts,
          video: job.id,
          format: job.format,
          lang: job.lang,
          output: job.output,
        });
        await recordOne(obs, resolved);
        console.log(`\n✓ Done    ${jobNum}`);
        results.push({ ...job, ok: true });
      } catch (err) {
        console.error(`\n✗ FAILED ${jobNum}: ${err.message}`);
        results.push({ ...job, ok: false, reason: err.message });
        if (failFast) {
          console.error('Stopping (--fail-fast).');
          break;
        }
      }
    }
  } finally {
    await obs.disconnect();
  }

  const wallSec = ((Date.now() - wallStart) / 1000).toFixed(0);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

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

  return { jobs, results };
}

// ── CLI entry ────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  const batchProgram = new Command('record-videos.mjs')
    .allowUnknownOption(true)
    .option('--ids <list>', 'comma-separated video ids (default: all)')
    .option('--formats <list>', 'comma-separated formats (default: shorts,yt)')
    .option('--langs <list>', 'comma-separated language codes (default: en,pl)')
    .option('--dry-run', 'print plan without recording')
    .option('--out-dir <path>', 'output directory')
    .option('--continue-on-error', 'keep going after a failed recording (default: true)')
    .option('--fail-fast', 'stop on first error');

  // Anything not recognized above falls through as a passthrough token for
  // record-obs.mjs — validate it against record-obs.mjs's own known flags
  // here, upfront, rather than letting a typo fail deep inside the first job.
  const { unknown } = batchProgram.parseOptions(process.argv.slice(2));
  const batchOpts = batchProgram.opts();
  const baseOpts = parseFlags(createRecordObsProgram(), unknown);

  const allVideoIds = loadVideos().map((v) => v.id);
  const ids = splitList(batchOpts.ids, allVideoIds);
  const formats = splitList(batchOpts.formats, ALL_FORMATS, ['shorts', 'yt']);
  const langs = splitList(batchOpts.langs, ALL_LANGS, ['en', 'pl']);

  const { results } = await runBatch({
    ids,
    formats,
    langs,
    dryRun: batchOpts.dryRun === true,
    outDir: batchOpts.outDir,
    failFast: batchOpts.failFast === true,
    baseOpts,
  });

  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}
