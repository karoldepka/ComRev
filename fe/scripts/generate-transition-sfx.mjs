#!/usr/bin/env node
/**
 * Pre-renders the slide-transition sound effects (chime, bell, padSwell,
 * sparkle) to static WAV files under assets/sfx/, so scripts/lib/audio-mix.mjs
 * can place them into a recording during post-processing without needing a
 * live AudioContext (which only exists in a browser).
 *
 * The site itself no longer plays these sounds — see the
 * TRANSITION_SOUND_VARIANTS comment in app/(tabs)/three-d.tsx for why — but
 * it still needs to know their names so it can log which one *would* have
 * played and when. The actual synthesis below is a port of the Web Audio
 * graphs that used to live in three-d.tsx (playChimeSound, playBellSound,
 * playPadSwellSound, playSparkleSound), run once here through a headless
 * browser's OfflineAudioContext (Node has no Web Audio API of its own).
 *
 * This only needs to be re-run if the sound design changes — the output
 * files are checked into assets/sfx/ like any other bundled asset.
 *
 * Usage:
 *   node scripts/generate-transition-sfx.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'assets', 'sfx');

const SAMPLE_RATE = 44100;

// Each variant's synthesis graph, and how many seconds of tail it needs to
// fully decay — ported 1:1 from the removed three-d.tsx functions, just
// swapping the shared `master`-through-limiter setup for a plain
// OfflineAudioContext destination (there's only one sound per render, so the
// limiter every synth used to share isn't needed here).
const VARIANTS = {
  chime: {
    duration: 1.6,
    build: `
      const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
      notes.forEach((freq, i) => {
        const t0 = now + i * 0.13;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t0);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 1.4);

        const overtone = ctx.createOscillator();
        overtone.type = "sine";
        overtone.frequency.setValueAtTime(freq * 2, t0);
        const overtoneGain = ctx.createGain();
        overtoneGain.gain.setValueAtTime(0.0001, t0);
        overtoneGain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
        overtone.connect(overtoneGain);
        overtoneGain.connect(ctx.destination);
        overtone.start(t0);
        overtone.stop(t0 + 0.9);
      });
    `,
  },
  bell: {
    duration: 2.6,
    build: `
      const fundamental = 329.63; // E4
      const partials = [1, 2.01, 3.03, 4.2]; // slightly detuned from true harmonics, like a real bell
      partials.forEach((mult, i) => {
        const t0 = now;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(fundamental * mult, t0);
        const gain = ctx.createGain();
        const peak = 0.3 / (i + 1);
        const decay = 2.4 - i * 0.3;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + decay + 0.1);
      });
    `,
  },
  padSwell: {
    duration: 2.1,
    build: `
      const t0 = now;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.setValueAtTime(0.7, t0);
      filter.frequency.setValueAtTime(300, t0);
      filter.frequency.linearRampToValueAtTime(1600, t0 + 0.6);
      filter.frequency.linearRampToValueAtTime(300, t0 + 1.7);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9);
      filter.connect(gain);
      gain.connect(ctx.destination);
      for (const [freq, detune] of [[220, -4], [220, 4], [329.63, 0]]) { // root, root, fifth above
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, t0);
        osc.detune.setValueAtTime(detune, t0);
        osc.connect(filter);
        osc.start(t0);
        osc.stop(t0 + 2.0);
      }
    `,
  },
  sparkle: {
    duration: 0.7,
    build: `
      const freqs = [783.99, 987.77, 1174.66, 1567.98]; // G5 B5 D6 G6
      freqs.forEach((freq, i) => {
        const t0 = now + i * 0.07;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t0);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.55);
      });
    `,
  },
};

/** Encodes interleaved 16-bit PCM samples as a standard WAV file buffer. */
function encodeWav(interleaved, numChannels, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = interleaved.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28); // byte rate
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < interleaved.length; i++) {
    const clamped = Math.max(-1, Math.min(1, interleaved[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buffer;
}

async function main() {
  let playwrightMod;
  try {
    playwrightMod = await import('playwright');
  } catch {
    console.error('Playwright is not installed. Run:\n  npm install --save-dev playwright\n  npx playwright install chromium');
    process.exit(1);
  }
  const { chromium } = playwrightMod;

  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const [name, variant] of Object.entries(VARIANTS)) {
    console.log(`Rendering "${name}" (${variant.duration}s)...`);
    const { left, right } = await page.evaluate(
      async ({ build, duration, sampleRate }) => {
        const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
        const now = ctx.currentTime;
        // eslint-disable-next-line no-new-func
        new Function('ctx', 'now', build)(ctx, now);
        const rendered = await ctx.startRendering();
        return {
          left: Array.from(rendered.getChannelData(0)),
          right: Array.from(rendered.getChannelData(rendered.numberOfChannels > 1 ? 1 : 0)),
        };
      },
      { build: variant.build, duration: variant.duration, sampleRate: SAMPLE_RATE },
    );

    const interleaved = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      interleaved[i * 2] = left[i];
      interleaved[i * 2 + 1] = right[i];
    }

    const wav = encodeWav(interleaved, 2, SAMPLE_RATE);
    const outPath = resolve(outDir, `${name}.wav`);
    writeFileSync(outPath, wav);
    console.log(`  wrote ${outPath} (${(wav.length / 1024).toFixed(0)} KB)`);
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
