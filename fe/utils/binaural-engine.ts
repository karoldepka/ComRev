// Singleton binaural-beat engine — this is the "primary" track driven by the
// slideshow/preset system (see soundscape-store.ts applyPresetConfig/applySlideConfig).
// Users can layer additional simultaneous binaural/noise/nature tracks via
// sound-engine.ts; this file is kept separate so the existing preset integration
// (app/preset/[id]/full-window.tsx, use-preset-loader.ts) is untouched.
//
// startBinaural() must be called from a synchronous user-gesture handler
// (click/tap) so ctx.resume() can unlock the AudioContext.
//
// Stereo routing: StereoPannerNode (pan=-1 left, pan=+1 right) is used
// instead of ChannelMergerNode — it works reliably across browsers.
// Headphones are required; speakers mix the two channels and cancel the beat.

import { getOrCreateAudioContext, getAudioContextState, onAudioContextStateChange, resumeAudioContext } from './audio-context';

let leftOsc: OscillatorNode | null = null;
let rightOsc: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let _playing = false;

export const onStateChange = onAudioContextStateChange;
export const getCtxState = getAudioContextState;

function teardownOscillators() {
  try { leftOsc?.stop(); } catch { /* already stopped */ }
  try { rightOsc?.stop(); } catch { /* already stopped */ }
  leftOsc = null;
  rightOsc = null;
  gainNode = null;
}

export function startBinaural(beatHz: number, carrier: number, volume: number): boolean {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  teardownOscillators();

  try {
    gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    // Route each oscillator to a dedicated stereo channel via StereoPannerNode.
    // This works more reliably across browsers than ChannelMergerNode.
    const leftPanner = ctx.createStereoPanner();
    leftPanner.pan.value = -1;
    const rightPanner = ctx.createStereoPanner();
    rightPanner.pan.value = 1;

    leftOsc = ctx.createOscillator();
    leftOsc.type = 'sine';
    leftOsc.frequency.value = carrier;

    rightOsc = ctx.createOscillator();
    rightOsc.type = 'sine';
    rightOsc.frequency.value = carrier + beatHz;

    leftOsc.connect(leftPanner).connect(gainNode);
    rightOsc.connect(rightPanner).connect(gainNode);
    gainNode.connect(ctx.destination);

    leftOsc.start();
    rightOsc.start();

    resumeAudioContext();
    _playing = true;
    return true;
  } catch (err) {
    console.warn('binaural-engine: start failed:', err);
    return false;
  }
}

export function stopBinaural() {
  teardownOscillators();
  const ctx = getOrCreateAudioContext();
  ctx?.suspend().catch(() => undefined);
  _playing = false;
}

export function updateBinaural(beatHz: number, carrier: number, volume: number) {
  const ctx = getOrCreateAudioContext();
  if (!_playing || !leftOsc || !rightOsc || !gainNode || !ctx) return;
  const now = ctx.currentTime;
  leftOsc.frequency.setTargetAtTime(carrier, now, 0.05);
  rightOsc.frequency.setTargetAtTime(carrier + beatHz, now, 0.05);
  gainNode.gain.setTargetAtTime(volume, now, 0.05);
}

export function isBinauralPlaying(): boolean {
  return _playing;
}
