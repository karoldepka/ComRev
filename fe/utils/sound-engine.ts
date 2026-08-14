// Multi-track sound mixer: any number of noise/nature/binaural tracks can play
// at once, each addressed by an arbitrary string id and each with its own volume.
// All tracks share the AudioContext from audio-context.ts so they mix together
// and the transport-status indicator reflects all of them at once.
//
// Nature ambience (forest/waterfall/waves) plays looped CC0/CC-BY field recordings
// (see ambience-tracks.ts for sourcing + attribution). Birds stays a procedural
// chirp synth so pitch/speed can be tuned live — real recordings can't do that
// without a pitch-shifter, which is out of scope here.

import { getOrCreateAudioContext, getMasterBus, resumeAudioContext } from './audio-context';
import { createNoiseBuffer, type NoiseColor } from './noise-buffers';
import { AMBIENCE_SOURCES, resolveAssetUri, type AmbienceKind } from './ambience-tracks';
import { MUSIC_SOURCES, type MusicKind } from './music-tracks';

interface Track {
  stop: () => void;
  setVolume: (volume: number) => void;
}

const tracks = new Map<string, Track>();

export function stopTrack(id: string) {
  tracks.get(id)?.stop();
  tracks.delete(id);
  ambienceLoadTokens.delete(id);
  musicLoadTokens.delete(id);
}

export function setTrackVolume(id: string, volume: number) {
  tracks.get(id)?.setVolume(volume);
}

export function isTrackPlaying(id: string): boolean {
  return tracks.has(id);
}

// ---------------------------------------------------------------------------
// Noise (white / pink / brown), independently loopable and layerable.
// ---------------------------------------------------------------------------

export function startNoiseTrack(id: string, color: NoiseColor, volume: number): boolean {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  stopTrack(id);

  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, color);
  source.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(gain).connect(getMasterBus() ?? ctx.destination);
  source.start();
  resumeAudioContext();

  tracks.set(id, {
    stop: () => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      gain.disconnect();
    },
    setVolume: (v) => gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Nature ambience: forest / waterfall / waves — looped field recordings.
// Decoded buffers are cached per kind so re-toggling never re-fetches.
// ---------------------------------------------------------------------------

const ambienceBufferCache = new Map<AmbienceKind, AudioBuffer>();
const ambienceLoadTokens = new Map<string, symbol>();

async function loadAmbienceBuffer(ctx: AudioContext, kind: AmbienceKind): Promise<AudioBuffer> {
  const cached = ambienceBufferCache.get(kind);
  if (cached) return cached;
  const source = AMBIENCE_SOURCES.find((s) => s.kind === kind);
  if (!source) throw new Error(`No ambience source registered for "${kind}"`);
  const response = await fetch(resolveAssetUri(source.file));
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  ambienceBufferCache.set(kind, buffer);
  return buffer;
}

export async function startAmbienceTrack(id: string, kind: AmbienceKind, volume: number): Promise<boolean> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  stopTrack(id);

  const token = Symbol();
  ambienceLoadTokens.set(id, token);

  let buffer: AudioBuffer;
  try {
    buffer = await loadAmbienceBuffer(ctx, kind);
  } catch (err) {
    console.warn('sound-engine: failed to load ambience track', kind, err);
    return false;
  }

  // A newer start/stop for this id happened while we were loading — abandon this one.
  if (ambienceLoadTokens.get(id) !== token) return false;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(gain).connect(getMasterBus() ?? ctx.destination);
  source.start();
  resumeAudioContext();

  tracks.set(id, {
    stop: () => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      gain.disconnect();
    },
    setVolume: (v) => gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Background music: full tracks from assets/music, looped like ambience.
// Decoded buffers are cached per kind so re-toggling never re-fetches.
// ---------------------------------------------------------------------------

const musicBufferCache = new Map<MusicKind, AudioBuffer>();
const musicLoadTokens = new Map<string, symbol>();

async function loadMusicBuffer(ctx: AudioContext, kind: MusicKind): Promise<AudioBuffer> {
  const cached = musicBufferCache.get(kind);
  if (cached) return cached;
  const source = MUSIC_SOURCES.find((s) => s.kind === kind);
  if (!source) throw new Error(`No music source registered for "${kind}"`);
  const response = await fetch(resolveAssetUri(source.file));
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  musicBufferCache.set(kind, buffer);
  return buffer;
}

export async function startMusicTrack(id: string, kind: MusicKind, volume: number): Promise<boolean> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  stopTrack(id);

  const token = Symbol();
  musicLoadTokens.set(id, token);

  let buffer: AudioBuffer;
  try {
    buffer = await loadMusicBuffer(ctx, kind);
  } catch (err) {
    console.warn('sound-engine: failed to load music track', kind, err);
    return false;
  }

  // A newer start/stop for this id happened while we were loading — abandon this one.
  if (musicLoadTokens.get(id) !== token) return false;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(gain).connect(getMasterBus() ?? ctx.destination);
  source.start();
  resumeAudioContext();

  tracks.set(id, {
    stop: () => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      gain.disconnect();
    },
    setVolume: (v) => gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Birds: procedural chirp synth, scheduled with randomized timing.
// pitch/speed are live-tunable via updateBirdsTrack.
// ---------------------------------------------------------------------------

interface BirdsLiveParams { pitch: number; speed: number }
const birdsParams = new Map<string, BirdsLiveParams>();

export function startBirdsTrack(id: string, volume: number, pitch: number, speed: number): boolean {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  stopTrack(id);

  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(getMasterBus() ?? ctx.destination);

  const params: BirdsLiveParams = { pitch, speed };
  birdsParams.set(id, params);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function playChirp() {
    const now = ctx!.currentTime;
    const noteCount = 2 + Math.floor(Math.random() * 3); // 2-4 note trill
    const baseFreq = 2200 * params.pitch;
    let t = now;
    for (let n = 0; n < noteCount; n++) {
      const osc = ctx!.createOscillator();
      const noteGain = ctx!.createGain();
      osc.type = 'sine';
      const freq = baseFreq * (0.85 + Math.random() * 0.4);
      const dur = (0.06 + Math.random() * 0.05) / params.speed;
      osc.frequency.setValueAtTime(freq * 0.85, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.6);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, t + dur);
      noteGain.gain.setValueAtTime(0.0001, t);
      noteGain.gain.linearRampToValueAtTime(1, t + dur * 0.2);
      noteGain.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(noteGain).connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * (0.7 / params.speed);
    }
  }

  function scheduleNext() {
    if (stopped) return;
    const baseDelaySeconds = 1.2 / params.speed;
    const delaySeconds = baseDelaySeconds * (0.6 + Math.random() * 0.8);
    timer = setTimeout(() => {
      playChirp();
      scheduleNext();
    }, delaySeconds * 1000);
  }

  scheduleNext();
  resumeAudioContext();

  tracks.set(id, {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      birdsParams.delete(id);
      gain.disconnect();
    },
    setVolume: (v) => gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
  });
  return true;
}

export function updateBirdsTrack(id: string, pitch: number, speed: number) {
  const params = birdsParams.get(id);
  if (params) {
    params.pitch = pitch;
    params.speed = speed;
  }
}

// ---------------------------------------------------------------------------
// Extra binaural-beat layers (independent from the primary track in
// binaural-engine.ts, so several presets can play simultaneously).
// ---------------------------------------------------------------------------

interface BinauralOscs { leftOsc: OscillatorNode; rightOsc: OscillatorNode }
const binauralOscs = new Map<string, BinauralOscs>();

export function startBinauralLayer(id: string, beatHz: number, carrier: number, volume: number): boolean {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  stopTrack(id);

  const gain = ctx.createGain();
  gain.gain.value = volume;

  const leftPanner = ctx.createStereoPanner();
  leftPanner.pan.value = -1;
  const rightPanner = ctx.createStereoPanner();
  rightPanner.pan.value = 1;

  const leftOsc = ctx.createOscillator();
  leftOsc.type = 'sine';
  leftOsc.frequency.value = carrier;
  const rightOsc = ctx.createOscillator();
  rightOsc.type = 'sine';
  rightOsc.frequency.value = carrier + beatHz;

  leftOsc.connect(leftPanner).connect(gain);
  rightOsc.connect(rightPanner).connect(gain);
  gain.connect(getMasterBus() ?? ctx.destination);

  leftOsc.start();
  rightOsc.start();
  resumeAudioContext();

  binauralOscs.set(id, { leftOsc, rightOsc });
  tracks.set(id, {
    stop: () => {
      try { leftOsc.stop(); } catch { /* already stopped */ }
      try { rightOsc.stop(); } catch { /* already stopped */ }
      leftOsc.disconnect();
      rightOsc.disconnect();
      leftPanner.disconnect();
      rightPanner.disconnect();
      gain.disconnect();
      binauralOscs.delete(id);
    },
    setVolume: (v) => gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
  });
  return true;
}

export function updateBinauralLayer(id: string, beatHz: number, carrier: number) {
  const ctx = getOrCreateAudioContext();
  const oscs = binauralOscs.get(id);
  if (!ctx || !oscs) return;
  const now = ctx.currentTime;
  oscs.leftOsc.frequency.setTargetAtTime(carrier, now, 0.05);
  oscs.rightOsc.frequency.setTargetAtTime(carrier + beatHz, now, 0.05);
}
