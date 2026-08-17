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
 *   --langs     <list>   es,de                      (default: es,de — the only supported values)
 *   --variants  <list>   default,fast,slow           (default: default) — see utils/slides/ab-variants.ts
 *
 * Engine:
 *   --engine    obs|frames  (default: obs) — obs records in real time via OBS
 *                Browser Source; frames uses a fake browser clock (Playwright)
 *                to record frame-by-frame, decoupled from wall-clock time —
 *                much faster, and doesn't need OBS running at all. See
 *                record-playwright.mjs's recordFramesOne.
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
 *   # All videos × shorts+yt × Spanish+German (default)
 *   node scripts/record-videos.mjs
 *
 *   # Just the "smarter" video, TikTok format, dry run
 *   node scripts/record-videos.mjs --ids smarter-7 --formats tiktok --dry-run
 *
 *   # All videos, all formats, Polish + English
 *   node scripts/record-videos.mjs --formats shorts,yt,yt-4k,tiktok --langs en,pl
 */

import { Command } from 'commander';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  cliArgv,
  createRecordFramesProgram,
  createRecordObsProgram,
  parseFlags,
} from './lib/cli-args.mjs';
import {
  fileNameFromTitle,
  loadVideos,
  missingTranslations,
  titleForLang,
} from './lib/videos-data.mjs';
import { connectObs, recordOne, resolveOptions } from './record-obs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_FORMATS = ['shorts', 'yt', 'tiktok', 'yt-4k'];

const ALL_LANGS = ['es', 'de'];

// Mirrors utils/slides/ab-variants.ts's AB_VARIANTS keys — duplicated rather
// than transpiling that module for Node, same reasoning as MUSIC_FILES in
// scripts/lib/audio-mix.mjs and LANG_NAMES in upload-youtube-batch.mjs.
const ALL_VARIANTS = ['default', 'fast', 'slow'];

function splitList(value, allowed, defaultValue = allowed) {
  if (!value) return defaultValue;
  const items = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
 * @param {string[]} [options.langs] (default: ['es', 'de'])
 * @param {string[]} [options.variants] A/B-test variant ids from ab-variants.ts (default: ['default'])
 * @param {'obs'|'frames'} [options.engine] 'obs' (default, real-time via OBS
 *   Browser Source) or 'frames' (fake-clock frame-by-frame via Playwright —
 *   see record-playwright.mjs's recordFramesOne; much faster wall-clock since
 *   the recording was never bound to real time in the first place, but needs
 *   no OBS connection at all — a shared headless browser is used instead).
 * @param {boolean} [options.dryRun]
 * @param {string} [options.outDir]
 * @param {boolean} [options.failFast]
 * @param {object} [options.baseOpts] Commander-opts-shaped object (as returned
 *   by createRecordObsProgram()'s or createRecordFramesProgram()'s .opts(),
 *   matching `engine`) providing shared per-recording settings (fps,
 *   binaural, ws-url, scale, ...) — video/format/lang/output are overridden
 *   per job.
 * @returns {Promise<{ jobs: object[], results: object[] }>}
 */
export async function runBatch(options = {}) {
  const {
    ids,
    formats = ['shorts', 'yt'],
    langs = ['es', 'de'],
    variants = ['default'],
    engine = 'obs',
    dryRun = false,
    outDir: outDirOpt,
    failFast = false,
    baseOpts = {},
  } = options;

  const allVideos = loadVideos();
  const videos = ids ? allVideos.filter((v) => ids.includes(v.id)) : allVideos;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resolve(
    __dirname,
    '..',
    outDirOpt ?? `../recordings/videos_${ts}`,
  );

  // Grouped by language first (then video, then format, then variant) so a
  // run produces complete language batches in sequence, rather than
  // interleaving languages within each video.
  const jobs = [];
  for (const lang of langs) {
    videos.forEach((video, videoIndex) => {
      for (const format of formats) {
        for (const variant of variants) {
          // Filename tracks the language being recorded, not always the
          // English title, and carries a variant suffix when non-default so
          // sibling A/B recordings of the same video don't collide.
          const variantSuffix = variant !== 'default' ? `_${variant}` : '';
          const filename = `${fileNameFromTitle(titleForLang(video.title, lang))}${variantSuffix}.mp4`;
          jobs.push({
            id: video.id,
            videoIndex: videoIndex + 1,
            videoTotal: videos.length,
            slides: video.principleCount + 1, // + the title card; display only, resolveOptions derives its own
            format,
            lang,
            variant,
            filename,
            output: `${outDir}/${lang}/${format}/${filename}`,
          });
        }
      }
    });
  }

  const total = jobs.length;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Video Batch Recorder');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Videos   : ${videos.map((v) => v.id).join(', ')}`);
  console.log(`  Formats  : ${formats.join(', ')}`);
  console.log(`  Languages: ${langs.join(', ')}`);
  console.log(`  Variants : ${variants.join(', ')}`);
  console.log(`  Engine   : ${engine}`);
  console.log(`  Total    : ${total} recording${total === 1 ? '' : 's'}`);
  console.log(`  Out dir  : ${outDir}`);
  if (dryRun) console.log('\n  *** DRY RUN — no recordings will be made ***');
  console.log('══════════════════════════════════════════════════════════\n');

  // Fail before recording anything if any video/language combination in this
  // batch isn't actually translated — otherwise recordings silently show
  // English content in a video meant for another language.
  const translationIssues = [];
  for (const lang of langs) {
    for (const video of videos) {
      const missing = missingTranslations(video, lang);
      if (missing.length > 0)
        translationIssues.push({ id: video.id, lang, missing });
    }
  }
  if (translationIssues.length > 0) {
    console.error(
      `✗ Missing translations — aborting before recording (${translationIssues.length} video/language combination(s)):\n`,
    );
    for (const issue of translationIssues) {
      console.error(
        `  ${issue.id} (${issue.lang}): ${issue.missing.length} missing`,
      );
      issue.missing.forEach((key) => console.error(`    - ${key}`));
    }
    throw new Error(
      `${translationIssues.length} video/language combination(s) have missing translations.`,
    );
  }

  if (dryRun) {
    console.log('Plan:\n');
    jobs.forEach((j, i) =>
      console.log(
        `  ${String(i + 1).padStart(3)}. video ${j.videoIndex} of ${j.videoTotal}  ${pad(j.id, 20)} ${pad(j.lang, 5)} ${pad(j.format, 8)} ${pad(j.variant, 8)} slides=${j.slides}  → ${j.filename}`,
      ),
    );
    console.log('');
    return { jobs, results: [] };
  }

  mkdirSync(outDir, { recursive: true });

  let obs = null;
  let sharedBrowser = null;
  let recordFramesOne = null;
  if (engine === 'frames') {
    ({ recordFramesOne } = await import('./record-playwright.mjs'));
    const { chromium } = await import('playwright');
    sharedBrowser = await chromium.launch({
      headless: true,
      args: [
        '--disable-infobars',
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
        '--ignore-gpu-blocklist',
      ],
    });
  } else {
    obs = await connectObs(
      baseOpts.wsUrl ?? 'ws://localhost:4455',
      baseOpts.wsPassword ?? '',
    );
  }

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
      console.log(
        `${jobNum} video ${job.videoIndex} of ${job.videoTotal}  id=${job.id}  format=${job.format}  lang=${job.lang}  variant=${job.variant}  slides=${job.slides}${etaStr}`,
      );
      console.log(`${'─'.repeat(62)}`);

      try {
        const resolved = resolveOptions({
          ...baseOpts,
          video: job.id,
          format: job.format,
          lang: job.lang,
          variant: job.variant,
          output: job.output,
        });
        if (engine === 'frames') {
          await recordFramesOne(resolved, {
            browser: sharedBrowser,
            renderScale: Math.min(1, Math.max(0.1, parseFloat(baseOpts.scale ?? '1'))),
            usePng: baseOpts.png === true,
            jpegQuality: parseInt(baseOpts.jpegQuality ?? '92', 10),
            keepFrames: baseOpts.keepFrames === true,
          });
        } else {
          await recordOne(obs, resolved);
        }
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
    if (obs) await obs.disconnect();
    if (sharedBrowser) await sharedBrowser.close();
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
    results
      .filter((r) => !r.ok)
      .forEach((r) =>
        console.log(`    ✗ ${r.id}_${r.format}_${r.lang}_${r.variant}  — ${r.reason}`),
      );
  }
  console.log(`  Output  : ${outDir}`);
  console.log('══════════════════════════════════════════════════════════\n');

  return { jobs, results };
}

// ── CLI entry ────────────────────────────────────────────────────────────────

const isMainModule =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  // Fired without a top-level await — see record-obs.mjs's CLI entry for why.
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function main() {
  const batchProgram = new Command('record-videos.mjs')
    .allowUnknownOption(true)
    .option('--ids <list>', 'comma-separated video ids (default: all)')
    .option('--formats <list>', 'comma-separated formats (default: shorts,yt)')
    .option('--langs <list>', 'comma-separated language codes: es, de (default: es,de)')
    .option('--variants <list>', 'comma-separated A/B-test variant ids from ab-variants.ts (default: default)')
    .option('--engine <obs|frames>', 'recording engine: obs (default, real-time via OBS) or frames (fake-clock frame-by-frame, no OBS needed — NOT currently faster for these videos, see record-playwright.mjs header)', 'obs')
    .option('--dry-run', 'print plan without recording')
    .option('--out-dir <path>', 'output directory')
    .option(
      '--continue-on-error',
      'keep going after a failed recording (default: true)',
    )
    .option('--fail-fast', 'stop on first error');

  // Anything not recognized above falls through as a passthrough token for
  // the chosen engine's own program — validate it against that program's
  // known flags here, upfront, rather than letting a typo fail deep inside
  // the first job.
  const { unknown } = batchProgram.parseOptions(cliArgv());
  const batchOpts = batchProgram.opts();
  const engine = batchOpts.engine === 'frames' ? 'frames' : 'obs';
  const baseOpts = parseFlags(
    engine === 'frames' ? createRecordFramesProgram() : createRecordObsProgram(),
    unknown,
  );

  const allVideoIds = loadVideos().map((v) => v.id);
  const ids = splitList(batchOpts.ids, allVideoIds);
  const formats = splitList(batchOpts.formats, ALL_FORMATS, ['shorts', 'yt']);
  const langs = splitList(batchOpts.langs, ALL_LANGS, ['es', 'de']);
  const variants = splitList(batchOpts.variants, ALL_VARIANTS, ['default']);

  const { results } = await runBatch({
    ids,
    formats,
    langs,
    variants,
    engine,
    dryRun: batchOpts.dryRun === true,
    outDir: batchOpts.outDir,
    failFast: batchOpts.failFast === true,
    baseOpts,
  });

  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
