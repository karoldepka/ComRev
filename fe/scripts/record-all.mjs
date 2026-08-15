#!/usr/bin/env node
/**
 * Batch recorder — produces one video per combination of preset × format × language.
 *
 * With --recorder obs (the default), all jobs share a single OBS WebSocket
 * connection instead of opening a new one per recording. --recorder
 * playwright still launches a fresh browser per job (spawned as a separate
 * process) since Playwright recordings don't have a persistent connection to share.
 *
 * Usage:
 *   node scripts/record-all.mjs [options]
 *
 * Filters  (comma-separated values or omit for all):
 *   --presets   <list>   mcon,motivation          (default: all registered presets)
 *   --formats   <list>   shorts,yt,yt-4k,tiktok   (default: shorts,yt)
 *   --langs     <list>   en,pl,de,fr,...           (default: all supported languages)
 *
 * Recorder control:
 *   --recorder  obs|playwright   Which recorder to use (default: obs)
 *   --dry-run                    Print plan without recording
 *   --out-dir   <path>           Output directory (default: ../recordings/batch_<ts>);
 *                                 files are saved as <lang>/<format>/<preset>.mp4
 *   --continue-on-error          Keep going after a failed recording (default: true)
 *   --fail-fast                  Stop on first error
 *
 * Pass-through flags (forwarded to the chosen recorder — see lib/cli-args.mjs's
 * createRecordObsProgram/createRecordPlaywrightProgram for the full list):
 *   --duration, --fps, --obs-sync, --url, --wait-ms,
 *   --binaural-hz, --binaural-carrier, --binaural-volume,
 *   --ws-url, --ws-password, --no-resize, --scene, --source,
 *   --frames, --headless, --headed, --scale, --jpeg-quality, ...
 *
 * Examples:
 *   # All presets × shorts+yt × all languages  (default)
 *   node scripts/record-all.mjs --duration 60
 *
 *   # Only mcon, shorts format, Polish + English, dry run
 *   node scripts/record-all.mjs --presets mcon --formats shorts --langs pl,en --dry-run
 *
 *   # All combinations, OBS sync, 90 s each
 *   node scripts/record-all.mjs --duration 90 --obs-sync
 */

import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { Command } from 'commander';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRecordObsProgram, createRecordPlaywrightProgram, parseFlags, cliArgv } from './lib/cli-args.mjs';
import { connectObs, recordOne, resolveOptions } from './record-obs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── constants pulled from the app ─────────────────────────────────────────────

const ALL_PRESETS = ['mcon', 'motivation', 'quotes', 'principles'];

const ALL_FORMATS = ['shorts', 'yt', 'tiktok', 'yt-4k'];

const ALL_LANGS = [
  'en', 'pl', 'de', 'it', 'fr', 'ca', 'zh', 'pt', 'es', 'hi', 'ar',
];

function splitList(value, allowed) {
  if (!value) return allowed;
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

function logProgress(wallStart, total, i, preset, format, lang) {
  let etaStr = '';
  if (i > 0) {
    const avgMs = (Date.now() - wallStart) / i;
    const etaSec = Math.ceil((avgMs * (total - i)) / 1000);
    const etaMin = Math.floor(etaSec / 60);
    etaStr = `  ETA ~${etaMin > 0 ? `${etaMin}m ` : ''}${etaSec % 60}s`;
  }
  console.log(`\n${'─'.repeat(62)}`);
  console.log(`[${i + 1}/${total}] preset=${preset}  format=${format}  lang=${lang}${etaStr}`);
  console.log(`${'─'.repeat(62)}`);
}

// Fired without a top-level await — see record-obs.mjs's CLI entry for why.
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  // ── arg parsing ─────────────────────────────────────────────────────────────

  const batchProgram = new Command('record-all.mjs')
    .allowUnknownOption(true)
    .option('--presets <list>', 'comma-separated presets (default: all)')
    .option('--formats <list>', 'comma-separated formats (default: shorts,yt,tiktok,yt-4k)')
    .option('--langs <list>', 'comma-separated language codes (default: all supported)')
    .option('--recorder <name>', 'obs or playwright', 'obs')
    .option('--dry-run', 'print plan without recording')
    .option('--out-dir <path>', 'output directory')
    .option('--continue-on-error', 'keep going after a failed recording (default: true)')
    .option('--fail-fast', 'stop on first error');

  const { unknown: passthrough } = batchProgram.parseOptions(cliArgv());
  const batch = batchProgram.opts();

  const presets = splitList(batch.presets, ALL_PRESETS);
  const formats = splitList(batch.formats, ALL_FORMATS);
  const langs = splitList(batch.langs, ALL_LANGS);
  const recorder = batch.recorder;
  const dryRun = batch.dryRun === true;
  const failFast = batch.failFast === true;

  if (!['obs', 'playwright'].includes(recorder)) {
    console.error(`Unknown recorder: "${recorder}". Use obs or playwright.`);
    process.exit(1);
  }

  // Validate passthrough tokens against whichever recorder was picked, upfront,
  // rather than letting a typo silently do nothing or fail deep inside the
  // first job.
  const baseOpts = parseFlags(
    recorder === 'playwright' ? createRecordPlaywrightProgram() : createRecordObsProgram(),
    passthrough,
  );

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resolve(__dirname, '..', batch.outDir ?? `../recordings/batch_${ts}`);

  // ── build job list ──────────────────────────────────────────────────────────

  const jobs = [];
  for (const preset of presets) {
    for (const format of formats) {
      for (const lang of langs) {
        const filename = `${preset}.mp4`;
        jobs.push({ preset, format, lang, filename, output: `${outDir}/${lang}/${format}/${filename}` });
      }
    }
  }

  const total = jobs.length;

  // ── banner ──────────────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Batch Recorder');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Presets  : ${presets.join(', ')}`);
  console.log(`  Formats  : ${formats.join(', ')}`);
  console.log(`  Languages: ${langs.join(', ')}`);
  console.log(`  Total    : ${total} recording${total === 1 ? '' : 's'}`);
  console.log(`  Recorder : ${recorder}`);
  console.log(`  Out dir  : ${outDir}`);
  if (dryRun) console.log('\n  *** DRY RUN — no recordings will be made ***');
  console.log('══════════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('Plan:\n');
    jobs.forEach((j, i) =>
      console.log(`  ${String(i + 1).padStart(3)}. ${pad(j.preset, 12)} ${pad(j.lang, 5)} ${pad(j.format, 8)} → ${j.lang}/${j.format}/${j.filename}`),
    );
    console.log('');
    return;
  }

  // ── run jobs ────────────────────────────────────────────────────────────────

  mkdirSync(outDir, { recursive: true });

  const results = [];
  const wallStart = Date.now();

  if (recorder === 'obs') {
    const obs = await connectObs(baseOpts.wsUrl ?? 'ws://localhost:4455', baseOpts.wsPassword ?? '');
    try {
      for (let i = 0; i < jobs.length; i++) {
        const { preset, format, lang, output } = jobs[i];
        const jobNum = `[${i + 1}/${total}]`;
        logProgress(wallStart, total, i, preset, format, lang);

        try {
          const resolved = resolveOptions({
            ...baseOpts,
            tab: `preset/${preset}/full-window`,
            format,
            lang,
            output,
          });
          await recordOne(obs, resolved);
          console.log(`\n✓ Done    ${jobNum}`);
          results.push({ ...jobs[i], ok: true });
        } catch (err) {
          console.error(`\n✗ FAILED ${jobNum}: ${err.message}`);
          results.push({ ...jobs[i], ok: false, reason: err.message });
          if (failFast) {
            console.error('Stopping (--fail-fast).');
            break;
          }
        }
      }
    } finally {
      await obs.disconnect();
    }
  } else {
    const recorderScript = resolve(__dirname, 'record-playwright.mjs');
    for (let i = 0; i < jobs.length; i++) {
      const { preset, format, lang, output } = jobs[i];
      const jobNum = `[${i + 1}/${total}]`;
      logProgress(wallStart, total, i, preset, format, lang);

      const args = [
        recorderScript,
        '--tab', `preset/${preset}/full-window`,
        '--format', format,
        '--lang', lang,
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
  }

  // ── summary ─────────────────────────────────────────────────────────────────

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
      console.log(`    ✗ ${r.preset}_${r.format}_${r.lang}  — ${r.reason}`),
    );
  }
  console.log(`  Output  : ${outDir}`);
  console.log('══════════════════════════════════════════════════════════\n');

  if (failed) process.exitCode = 1;
}
