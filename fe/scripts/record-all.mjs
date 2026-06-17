#!/usr/bin/env node
/**
 * Batch recorder — produces one video per combination of preset × format × language.
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
 *   --recorder  obs|playwright   Which recorder to call (default: obs)
 *   --dry-run                    Print plan without recording
 *   --out-dir   <path>           Output directory (default: ../recordings/batch_<ts>)
 *   --continue-on-error          Keep going after a failed recording (default: true)
 *   --fail-fast                  Stop on first error
 *
 * Pass-through flags (forwarded to the chosen recorder):
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
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── constants pulled from the app ─────────────────────────────────────────────

const ALL_PRESETS = ['mcon', 'motivation'];

const ALL_FORMATS = ['shorts', 'yt', 'tiktok', 'yt-4k'];

const ALL_LANGS = [
  'en', 'pl', 'de', 'it', 'fr', 'ca', 'zh', 'pt', 'es', 'hi', 'ar',
];

// ── arg parsing ───────────────────────────────────────────────────────────────

/** Args consumed by this script; everything else is forwarded to the recorder. */
const BATCH_KEYS = new Set([
  'presets', 'formats', 'langs', 'recorder', 'dry-run', 'out-dir',
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

function splitList(value, allowed) {
  if (!value || value === true) return allowed;
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

const presets  = splitList(batch.presets,  ALL_PRESETS);
const formats  = splitList(batch.formats,  ALL_FORMATS);
const langs    = splitList(batch.langs,    ALL_LANGS);
const recorder = batch.recorder ?? 'obs';
const dryRun   = batch['dry-run'] === true;
const failFast = batch['fail-fast'] === true;

if (!['obs', 'playwright'].includes(recorder)) {
  console.error(`Unknown recorder: "${recorder}". Use obs or playwright.`);
  process.exit(1);
}

const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(__dirname, '..', batch['out-dir'] ?? `../recordings/batch_${ts}`);
const recorderScript = resolve(__dirname, `record-${recorder}.mjs`);

// ── build job list ────────────────────────────────────────────────────────────

const jobs = [];
for (const preset of presets) {
  for (const format of formats) {
    for (const lang of langs) {
      const filename = `${preset}_${format}_${lang}.mp4`;
      jobs.push({ preset, format, lang, filename, output: `${outDir}/${filename}` });
    }
  }
}

const total = jobs.length;

// ── banner ────────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
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
if (passthrough.length) console.log(`  Passthru : ${passthrough.join(' ')}`);
console.log('══════════════════════════════════════════════════════════\n');

if (dryRun) {
  console.log('Plan:\n');
  jobs.forEach((j, i) =>
    console.log(`  ${String(i + 1).padStart(3)}. ${pad(j.preset, 12)} ${pad(j.format, 8)} ${pad(j.lang, 5)} → ${j.filename}`),
  );
  console.log('');
  process.exit(0);
}

// ── run jobs ──────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const results = [];
const wallStart = Date.now();

for (let i = 0; i < jobs.length; i++) {
  const { preset, format, lang, output } = jobs[i];
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
  console.log(`${jobNum} preset=${preset}  format=${format}  lang=${lang}${etaStr}`);
  console.log(`${'─'.repeat(62)}`);

  const args = [
    recorderScript,
    '--preset', preset,
    '--tab',    `preset/${preset}/full-window`,
    '--format', format,
    '--lang',   lang,
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
    console.log(`    ✗ ${r.preset}_${r.format}_${r.lang}  — ${r.reason}`),
  );
}
console.log(`  Output  : ${outDir}`);
console.log('══════════════════════════════════════════════════════════\n');

process.exit(failed ? 1 : 0);
