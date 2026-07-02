// One-shot sound effects and mix-wide modifiers, layered on top of the
// multi-track mixer in sound-engine.ts. These act on the shared master bus
// (see audio-context.ts) so they affect the whole soundscape at once rather
// than needing per-track wiring.

import { getOrCreateAudioContext, getMasterBus, resumeAudioContext } from './audio-context';

// ---------------------------------------------------------------------------
// Bass swipe: a sub-bass oscillator sweeping frequency + a synced lowpass
// filter sweep, used as a riser ("up") or drop/dive ("down") transition stab.
// ---------------------------------------------------------------------------

export type SweepDirection = 'up' | 'down';

export function triggerBassSwipe(direction: SweepDirection, volume = 0.6, duration = 1.4): boolean {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  const destination = getMasterBus() ?? ctx.destination;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  osc.connect(filter).connect(gain).connect(destination);

  const [startFreq, endFreq] = direction === 'up' ? [35, 320] : [320, 35];
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

  const [filterStart, filterEnd] = direction === 'up' ? [180, 3200] : [3200, 180];
  filter.frequency.setValueAtTime(filterStart, now);
  filter.frequency.exponentialRampToValueAtTime(filterEnd, now + duration);

  // Fade-in/out envelope so the sweep doesn't click at start/end.
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + duration * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.start(now);
  osc.stop(now + duration + 0.05);
  resumeAudioContext();

  osc.onended = () => {
    osc.disconnect();
    filter.disconnect();
    gain.disconnect();
  };

  return true;
}

// ---------------------------------------------------------------------------
// Stutter gate: rhythmically chops the entire mix open/closed, following a
// pattern of divisions-per-beat that repeats and can change speed bar to bar —
// e.g. [8, 8, 4, 4, 2, 2] chops in 16th notes for two beats, then 8ths, then
// quarters, then loops (the classic decelerating "trance gate" stutter:
// ssssssss ssssssss ssss ssss ss ss).
//
// Web Audio timers alone jitter too much for tight 16th-note chops, so this
// uses a standard lookahead scheduler: precise gain automation is scheduled
// a fraction of a second ahead of playback time, topped up on an interval.
// ---------------------------------------------------------------------------

export type GatePattern = number[];

export const STUTTER_GATE_PATTERN: GatePattern = [8, 8, 4, 4, 2, 2];

const LOOKAHEAD_SECONDS = 0.5;
const SCHEDULER_INTERVAL_MS = 100;
const GATE_DUTY_CYCLE = 0.55; // fraction of each step the gate stays open

let gateTimer: ReturnType<typeof setInterval> | null = null;

export function isStutterGateActive(): boolean {
  return gateTimer !== null;
}

export function startStutterGate(bpm: number, pattern: GatePattern = STUTTER_GATE_PATTERN): boolean {
  stopStutterGate();
  const ctx = getOrCreateAudioContext();
  const bus = getMasterBus();
  if (!ctx || !bus) return false;

  const beatSeconds = 60 / bpm;
  let cursor = ctx.currentTime + 0.05;
  let patternIndex = 0;

  function scheduleAhead() {
    while (cursor < ctx!.currentTime + LOOKAHEAD_SECONDS) {
      const divisions = pattern[patternIndex % pattern.length];
      const stepSeconds = beatSeconds / divisions;
      for (let i = 0; i < divisions; i++) {
        const onAt = cursor + i * stepSeconds;
        const offAt = onAt + stepSeconds * GATE_DUTY_CYCLE;
        bus!.gain.setValueAtTime(1, onAt);
        bus!.gain.setValueAtTime(0, offAt);
      }
      cursor += beatSeconds;
      patternIndex++;
    }
  }

  scheduleAhead();
  gateTimer = setInterval(scheduleAhead, SCHEDULER_INTERVAL_MS);
  resumeAudioContext();
  return true;
}

export function stopStutterGate(): void {
  if (gateTimer) {
    clearInterval(gateTimer);
    gateTimer = null;
  }
  const ctx = getOrCreateAudioContext();
  const bus = getMasterBus();
  if (ctx && bus) {
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(1, ctx.currentTime); // leave the gate open
  }
}
