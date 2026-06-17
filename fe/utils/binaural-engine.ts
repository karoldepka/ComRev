// Singleton Web Audio engine for binaural beats / soundscapes.
// startBinaural() must be called from a synchronous user-gesture handler
// (click/tap) so ctx.resume() can unlock the AudioContext.
//
// Stereo routing: StereoPannerNode (pan=-1 left, pan=+1 right) is used
// instead of ChannelMergerNode — it works reliably across browsers.
// Headphones are required; speakers mix the two channels and cancel the beat.

let audioCtx: AudioContext | null = null;
let leftOsc: OscillatorNode | null = null;
let rightOsc: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let _playing = false;

type StateListener = (state: AudioContextState | 'unavailable') => void;
const stateListeners = new Set<StateListener>();

function notifyState() {
  const state = audioCtx ? audioCtx.state : 'suspended';
  stateListeners.forEach((fn) => fn(state));
}

export function onStateChange(fn: StateListener): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

export function getCtxState(): AudioContextState | 'unavailable' {
  if (typeof window === 'undefined') return 'unavailable';
  if (!audioCtx) return 'suspended';
  return audioCtx.state;
}

function getOrCreateCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctor() as AudioContext;
    audioCtx.onstatechange = notifyState;
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

    // resume() must be called synchronously within the user gesture to unlock.
    ctx.resume().then(notifyState).catch(() => undefined);
    _playing = true;
    return true;
  } catch (err) {
    console.warn('binaural-engine: start failed:', err);
    return false;
  }
}

export function stopBinaural() {
  teardownOscillators();
  audioCtx?.suspend().then(notifyState).catch(() => undefined);
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
