/**
 * Mixes background music, an optional binaural-beat layer, and timed slide-
 * transition sound effects onto a silent recording via ffmpeg — the audio
 * side of the pipeline described in app/(tabs)/three-d.tsx's
 * TRANSITION_SOUND_VARIANTS comment: the site only logs *what* would have
 * played and *when* (see scripts/record-obs.mjs's "Sound events"), and this
 * module is what actually places the real sound into the video afterward.
 */

import { execFileSync, execSync } from 'child_process';
import { existsSync, renameSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// Mirrors utils/music-tracks.ts's MUSIC_SOURCES — duplicated here (rather than
// transpiling that module for Node) because it's a short, stable list and the
// TS file also carries Metro-only `require()` asset references that mean
// nothing outside the app bundler.
const MUSIC_FILES = {
  'oceanking-patents': 'oceanking-patents-219735.mp3',
  'oceanking-street-lights': 'oceanking-street-lights-219744.mp3',
};

const SFX_DIR = resolve(REPO_ROOT, 'assets', 'sfx');
const MUSIC_DIR = resolve(REPO_ROOT, 'assets', 'music');

const DEFAULT_MUSIC_VOLUME = 0.35; // matches store/soundscape-store.ts's defaultLayer()

export function hasFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function probeDurationSec(videoPath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ]).toString().trim();
  const seconds = parseFloat(out);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Could not determine duration of ${videoPath} (ffprobe returned "${out}")`);
  }
  return seconds;
}

/**
 * Mixes `soundLog` (as collected by record-obs.mjs's ready-server: `{ music,
 * events: [{variant, tMs}, ...] }`) plus an optional binaural layer onto
 * `videoPath` in place. No-ops (leaving the silent video as-is) if there's
 * nothing to mix and ffmpeg is unavailable, rather than failing the whole
 * recording over an audio problem.
 *
 * @param {string} videoPath
 * @param {{ music?: string, events: { variant: string, tMs: number }[] }} soundLog
 * @param {{ hz: number, carrier: number, volume: number } | null} binaural
 */
export function mixAudioIntoVideo(videoPath, soundLog, binaural) {
  const events = soundLog?.events ?? [];
  const musicKind = soundLog?.music;
  const hasBinaural = !!binaural?.hz;

  if (!musicKind && events.length === 0 && !hasBinaural) {
    console.log('No sound events, music, or binaural layer to mix — leaving recording silent.');
    return;
  }

  if (!hasFfmpeg()) {
    console.warn('ffmpeg not found — skipping audio mix; recording will stay silent. Install ffmpeg (winget install Gyan.FFmpeg) to enable this.');
    return;
  }

  const musicFile = musicKind ? MUSIC_FILES[musicKind] : undefined;
  if (musicKind && !musicFile) {
    console.warn(`Unknown music kind "${musicKind}" — skipping music layer.`);
  }
  const musicPath = musicFile ? resolve(MUSIC_DIR, musicFile) : null;
  if (musicPath && !existsSync(musicPath)) {
    console.warn(`Music file not found at ${musicPath} — skipping music layer.`);
  }

  const resolvedEvents = events
    .map((e) => ({ ...e, file: resolve(SFX_DIR, `${e.variant}.wav`) }))
    .filter((e) => {
      if (existsSync(e.file)) return true;
      console.warn(`No SFX asset for variant "${e.variant}" (expected ${e.file}) — skipping that event. Run scripts/generate-transition-sfx.mjs.`);
      return false;
    });

  const durationSec = probeDurationSec(videoPath);

  const inputArgs = ['-i', videoPath]; // input 0: the silent video
  const filterInputs = [];
  let nextInput = 1;

  if (musicPath && existsSync(musicPath)) {
    inputArgs.push('-stream_loop', '-1', '-i', musicPath);
    filterInputs.push(`[${nextInput}:a]volume=${DEFAULT_MUSIC_VOLUME},atrim=0:${durationSec},asetpts=PTS-STARTPTS[music]`);
    nextInput++;
  }

  if (hasBinaural) {
    const { hz, carrier, volume } = binaural;
    // Left ear: carrier Hz | Right ear: carrier + beatHz — same construction
    // record-playwright.mjs already uses for the same purpose.
    inputArgs.push(
      '-f', 'lavfi',
      '-i', `aevalsrc=${volume}*sin(2*PI*${carrier}*t)|${volume}*sin(2*PI*${carrier + hz}*t):c=stereo:s=44100:d=${durationSec}`,
    );
    filterInputs.push(`[${nextInput}:a]anull[binaural]`);
    nextInput++;
  }

  // Sorted so each event's "budget" below (time until the *next* transition)
  // is meaningful regardless of the order sound-event beacons happened to
  // arrive in.
  const sortedEvents = resolvedEvents.slice().sort((a, b) => a.tMs - b.tMs);

  const sfxLabels = [];
  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];
    const next = sortedEvents[i + 1];
    inputArgs.push('-i', event.file);
    const label = `sfx${nextInput}`;
    const delayMs = Math.max(0, Math.round(event.tMs));

    // Each transition sound decays for up to ~2.6s (see
    // generate-transition-sfx.mjs), which easily outlasts a single slide now
    // that slides run this short (SEQUENCE_DURATION_SCALE) — left alone,
    // three or four overlapping decays pile up into a muddy, garbled wash by
    // the time the video is a few slides in. Cut each one short (with a
    // quick fade so it doesn't click) once the next transition is due,
    // instead of always letting it ring out in full. The last event has no
    // "next" to duck for, so it's left to decay naturally.
    let trimFilter = '';
    if (next) {
      const budgetSec = Math.max(0.1, (next.tMs - event.tMs) / 1000);
      const fadeOutSec = Math.min(0.2, budgetSec * 0.3);
      const fadeStartSec = Math.max(0, budgetSec - fadeOutSec);
      trimFilter = `atrim=0:${budgetSec},afade=t=out:st=${fadeStartSec}:d=${fadeOutSec},`;
    }
    filterInputs.push(`[${nextInput}:a]${trimFilter}adelay=${delayMs}|${delayMs}[${label}]`);
    sfxLabels.push(label);
    nextInput++;
  }

  const mixLabels = [
    ...(musicPath && existsSync(musicPath) ? ['music'] : []),
    ...(hasBinaural ? ['binaural'] : []),
    ...sfxLabels,
  ];

  if (mixLabels.length === 0) {
    console.log('No usable audio layers after resolving assets — leaving recording silent.');
    return;
  }

  const filterComplex = [
    ...filterInputs,
    `${mixLabels.map((l) => `[${l}]`).join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0[aout]`,
  ].join(';');

  const tempPath = videoPath.replace(/(\.[^.]+)$/, '.mixed$1');

  const ffmpegArgs = [
    '-y',
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(durationSec),
    '-movflags', '+faststart',
    tempPath,
  ];

  console.log(`\nMixing audio (${mixLabels.length} layer${mixLabels.length === 1 ? '' : 's'}: ${mixLabels.join(', ')})...`);
  console.log(`ffmpeg ${ffmpegArgs.join(' ')}\n`);
  execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });

  // tempPath is a sibling of videoPath (same directory), so a same-filesystem
  // rename is enough — no need for the cross-device fallback the OBS-output
  // move (moveFileWithRetry in record-obs.mjs) needs.
  unlinkSync(videoPath);
  renameSync(tempPath, videoPath);

  console.log(`✓ Mixed audio into ${videoPath}`);
}
