/**
 * Shared Commander program definitions for the recording scripts. Declaring
 * flags once here means the parser, the "known flags" list, and the --help
 * text can never drift apart the way the old hand-rolled parser + a separate
 * flag-name whitelist could.
 */

import { Command } from 'commander';

/** Options record-obs.mjs accepts, both when run directly and when its flags
 * are forwarded (as raw passthrough tokens) from record-videos.mjs/record-all.mjs. */
export function createRecordObsProgram() {
  return new Command('record-obs.mjs')
    .description('Record a preset route (or a declared video) via OBS Browser Source.')
    .option('--video [id]', 'Record a video declared in videos.data.tsx by id; bare or "all" records every declared video')
    .option('--format <name>', 'Output format preset: shorts, tiktok, yt, yt-4k', 'shorts')
    .option('--width <px>', 'Custom canvas width (overrides --format)')
    .option('--height <px>', 'Custom canvas height (overrides --format)')
    .option('--slides [count]', 'Stop after this many sequence slides (bare = 7)')
    .option('--duration <seconds>', 'Fixed recording duration instead of slide-count stop mode (default 60; presence alone opts out of slide-count stop mode)')
    .option('--fps <number>', 'Frames per second', '60')
    .option('--url <base>', 'App base URL', 'http://localhost:8081')
    .option('--tab <path>', 'App route appended to --url (default: preset/principles/full-window, or preset/video-<id>/full-window with --video)')
    .option('--no-tab', 'Record --url as-is, without appending --tab')
    .option('--no-refresh', 'Skip the frame-0 refresh')
    .option('--wait-ms <ms>', 'Give up waiting for the ready signal after this long (only with --no-tab)')
    .option('--lang <code>', 'Language query param', '')
    .option('--output <path>', 'Destination path for the finished file')
    .option('--ws-url <url>', 'OBS WebSocket URL', 'ws://localhost:4455')
    .option('--ws-password <pass>', 'OBS WebSocket password', '')
    .option('--no-resize', 'Skip setting OBS canvas/output resolution & fps')
    .option('--scene <name>', 'OBS scene name', 'AnimationRecorder')
    .option('--source <name>', 'OBS browser source name', 'AnimationBrowser')
    .option('--binaural-hz <number>', 'Binaural beat frequency in Hz (0 to disable)', '6')
    .option('--binaural-carrier <number>', 'Binaural carrier frequency in Hz', '200')
    .option('--binaural-volume <0-1>', 'Binaural tone amplitude', '0.35')
    .option('--obs-sync', 'Pause the animation until OBS is ready, then start both in sync')
    .option('--out-dir <path>', 'Output directory (only used with --video all)')
    .option('--dry-run', 'Print the resolved plan without recording or connecting to OBS')
    .option('--fail-fast', 'Stop on first error (only used with --video all)')
    .option('--continue-on-error', 'Keep going after a failed recording (only used with --video all)');
}

/** Options record-playwright.mjs accepts. */
export function createRecordPlaywrightProgram() {
  return new Command('record-playwright.mjs')
    .description('Record a preset route via Playwright (realtime or frame-by-frame).')
    .option('--format <name>', 'Output format: yt, shorts, yt-4k', 'yt')
    .option('--duration <seconds>', 'Recording duration', '60')
    .option('--tab <path>', 'App route to open', 'preset/mcon/full-window')
    .option('--lang <code>', 'Language query param', '')
    .option('--url <base>', 'App base URL', 'http://localhost:8081')
    .option('--fps <number>', 'Frames per second', '60')
    .option('--wait-ms <ms>', 'Frame-by-frame mode: fake time to fast-forward before recording', '3000')
    .option('--headless', 'Run without a visible browser window')
    .option('--headed', 'Force a visible browser window')
    .option('--frames', 'Use frame-by-frame mode')
    .option('--png', 'Use PNG for intermediate frames instead of JPEG')
    .option('--jpeg-quality <1-100>', 'JPEG quality for intermediate frames', '92')
    .option('--no-ffmpeg', 'Keep raw output, skip MP4 conversion')
    .option('--keep-frames', 'Keep temporary frame files directory after encoding')
    .option('--binaural-hz <number>', 'Binaural beat frequency in Hz (0 to disable)', '6')
    .option('--binaural-carrier <number>', 'Binaural carrier frequency in Hz', '200')
    .option('--binaural-volume <0-1>', 'Binaural tone amplitude', '0.35')
    .option('--scale <0.1-1>', 'Render at this fraction of full resolution', '1')
    .option('--output <path>', 'Output file path');
}

/** Parses a raw token list (process.argv.slice(2), or a passthrough array
 * forwarded from a batch script) against a program built by one of the
 * factories above. Exits with Commander's own usage/error output if any
 * token is unrecognized — this is what makes typos like --video-all fail
 * loudly instead of being silently ignored. */
export function parseFlags(program, tokens) {
  program.parse(tokens, { from: 'user' });
  return program.opts();
}
