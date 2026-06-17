// Singleton Web Audio engine for binaural beats / soundscapes.
// start() must be called from a user-gesture handler (click/tap) so the
// AudioContext can transition out of its initial "suspended" state.

let audioCtx: AudioContext | null = null;
let leftOsc: OscillatorNode | null = null;
let rightOsc: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let _playing = false;

function getOrCreateCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctor() as AudioContext;
  }
  return audioCtx;
}

function teardownOscillators() {
  try { leftOsc?.stop(); } catch { /* already stopped */ }
  try { rightOsc?.stop(); } catch { /* already stopped */ }
  leftOsc = null;
  rightOsc = null;
  gainNode = null;
}

export function startBinaural(beatHz: number, carrier: number, volume: number): boolean {
  const ctx = getOrCreateCtx();
  if (!ctx) return false;

  teardownOscillators();

  try {
    const merger = ctx.createChannelMerger(2);
    gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    leftOsc = ctx.createOscillator();
    leftOsc.type = 'sine';
    leftOsc.frequency.value = carrier;

    rightOsc = ctx.createOscillator();
    rightOsc.type = 'sine';
    rightOsc.frequency.value = carrier + beatHz;

    leftOsc.connect(merger, 0, 0);
    rightOsc.connect(merger, 0, 1);
    merger.connect(gainNode);
    gainNode.connect(ctx.destination);

    leftOsc.start();
    rightOsc.start();

    // resume() inside a user-gesture handler will unlock the AudioContext
    ctx.resume().catch(() => undefined);
    _playing = true;
    return true;
  } catch (err) {
    console.warn('binaural-engine: start failed:', err);
    return false;
  }
}

export function stopBinaural() {
  teardownOscillators();
  audioCtx?.suspend().catch(() => undefined);
  _playing = false;
}

export function updateBinaural(beatHz: number, carrier: number, volume: number) {
  if (!_playing || !leftOsc || !rightOsc || !gainNode || !audioCtx) return;
  const now = audioCtx.currentTime;
  leftOsc.frequency.setTargetAtTime(carrier, now, 0.05);
  rightOsc.frequency.setTargetAtTime(carrier + beatHz, now, 0.05);
  gainNode.gain.setTargetAtTime(volume, now, 0.05);
}

export function isBinauralPlaying(): boolean {
  return _playing;
}
