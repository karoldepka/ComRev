// Shared singleton Web Audio context used by every sound engine (binaural beats,
// noise, nature ambience). Centralized so all engines mix through one context
// instead of each spinning up its own — browsers discourage multiple contexts.

let audioCtx: AudioContext | null = null;
let masterBus: GainNode | null = null;

type StateListener = (state: AudioContextState | 'unavailable') => void;
const stateListeners = new Set<StateListener>();

function notifyState() {
  const state = audioCtx ? audioCtx.state : 'suspended';
  stateListeners.forEach((fn) => fn(state));
}

export function onAudioContextStateChange(fn: StateListener): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

export function getAudioContextState(): AudioContextState | 'unavailable' {
  if (typeof window === 'undefined') return 'unavailable';
  if (!audioCtx) return 'suspended';
  return audioCtx.state;
}

export function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctor() as AudioContext;
    audioCtx.onstatechange = notifyState;
    masterBus = null; // stale reference to the old context's node graph
  }
  return audioCtx;
}

// Every engine's output routes through this single gain node on its way to
// speakers, so a mix-wide modifier (e.g. the stutter gate in sound-fx.ts) can
// chop the whole soundscape at once instead of needing per-track wiring.
export function getMasterBus(): GainNode | null {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return null;
  if (!masterBus) {
    masterBus = ctx.createGain();
    masterBus.gain.value = 1;
    masterBus.connect(ctx.destination);
  }
  return masterBus;
}

// Sets the master output gain (0–1). This scales the entire mix without
// touching individual track volumes, so the relative blend is preserved.
export function setMasterGain(value: number): void {
  const bus = getMasterBus();
  if (!bus) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;
  bus.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
}

// resume() must ultimately be triggered by a user gesture (click/tap) to unlock
// audio playback; callers should invoke this synchronously from that handler.
export function resumeAudioContext(): AudioContext | null {
  const ctx = getOrCreateAudioContext();
  ctx?.resume().then(notifyState).catch(() => undefined);
  return ctx;
}
