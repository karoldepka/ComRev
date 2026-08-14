/**
 * Shared CLI-arg parsing/validation for the recording scripts. Unknown flags
 * used to be silently ignored (e.g. --video-all instead of --video all just
 * did nothing) — assertKnownFlags fails loudly instead, immediately, rather
 * than wasting a recording run before the mistake becomes apparent.
 */

/** `--foo bar` -> { foo: 'bar' }; a flag with no value (or followed by another
 * flag) becomes `true`, e.g. `--dry-run` -> { 'dry-run': true }. */
export function parseArgs(argv) {
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

/** Exits with an error listing the offending flag(s) and the full known list
 * if `args` (or, for passthrough validation, an explicit list of flag names)
 * contains anything not in `knownFlags`. */
export function assertKnownFlags(flagNames, knownFlags, scriptLabel) {
  const known = new Set(knownFlags);
  const unknown = flagNames.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    console.error(
      `Unknown flag${unknown.length > 1 ? 's' : ''} for ${scriptLabel}: ${unknown.map((k) => `--${k}`).join(', ')}\n` +
      `Known flags: ${[...known].sort().map((k) => `--${k}`).join(', ')}`,
    );
    process.exit(1);
  }
}

/** Flag names a bare `--foo bar` / `--foo` token list can contain, extracted
 * the same way parseArgs does, so passthrough tokens can be checked without
 * actually running parseArgs on them. */
export function flagNamesFromTokens(tokens) {
  return tokens.filter((t) => t.startsWith('--')).map((t) => t.slice(2));
}

export const RECORD_OBS_FLAGS = [
  'video', 'format', 'width', 'height', 'slides', 'duration', 'fps', 'url', 'tab',
  'no-tab', 'no-refresh', 'wait-ms', 'lang', 'output', 'ws-url', 'ws-password',
  'no-resize', 'scene', 'source', 'binaural-hz', 'binaural-carrier', 'binaural-volume',
  'obs-sync', 'out-dir', 'dry-run', 'fail-fast', 'continue-on-error',
];

export const RECORD_PLAYWRIGHT_FLAGS = [
  'format', 'duration', 'tab', 'lang', 'url', 'fps', 'wait-ms', 'headless', 'headed',
  'frames', 'png', 'jpeg-quality', 'no-ffmpeg', 'keep-frames', 'binaural-hz',
  'binaural-carrier', 'binaural-volume', 'scale', 'output',
];
