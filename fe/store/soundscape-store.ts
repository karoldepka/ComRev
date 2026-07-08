import { create } from 'zustand';
import { nanoid } from 'nanoid/non-secure';
import {
  isBinauralPlaying,
  startBinaural,
  stopBinaural,
  updateBinaural,
} from '@/utils/binaural-engine';
import {
  startAmbienceTrack,
  startBinauralLayer,
  startBirdsTrack,
  isTrackPlaying,
  startNoiseTrack,
  stopTrack,
  updateBinauralLayer,
  updateBirdsTrack,
  setTrackVolume,
} from '@/utils/sound-engine';
import { setGlobalAudioPaused, setMasterGain } from '@/utils/audio-context';
import type { NoiseColor } from '@/utils/noise-buffers';
import { AMBIENCE_SOURCES, type AmbienceKind, type AmbienceCategory } from '@/utils/ambience-tracks';
import {
  startStutterGate,
  stopStutterGate,
  isStutterGateActive,
  triggerBassSwipe as triggerBassSwipeFx,
  type SweepDirection,
} from '@/utils/sound-fx';
import { API_BASE } from '@/utils/api-config';
import {
  deleteSoundscapePreset as deleteSoundscapePresetLocal,
  deleteSoundscapePresetFromBackend,
  getLastSoundscapeState,
  getSoundscapePresets as getSoundscapePresetsLocal,
  loadSoundscapePresetsFromBackend,
  saveLastSoundscapeState,
  saveSoundscapePreset as saveSoundscapePresetLocal,
  saveSoundscapePresetOfflineFirst,
  type SoundscapePreset,
} from '@/utils/config-store';

export interface SoundscapeConfig {
  beatHz?: number;    // 0 or absent = off
  carrier?: number;   // default 200 Hz
  volume?: number;    // 0–1, default 0.35
}

export interface WavePreset {
  key: string;
  label: string;
  sub: string;
  hz: number;
}

export const WAVE_PRESETS: WavePreset[] = [
  { key: 'delta', label: 'Delta', sub: '~2 Hz · deep sleep', hz: 2 },
  { key: 'theta', label: 'Theta', sub: '~6 Hz · meditation', hz: 6 },
  { key: 'alpha', label: 'Alpha', sub: '~10 Hz · relaxed focus', hz: 10 },
  { key: 'beta', label: 'Beta', sub: '~20 Hz · active thinking', hz: 20 },
  { key: 'gamma', label: 'Gamma', sub: '~40 Hz · peak performance', hz: 40 },
];

export const NOISE_COLORS: { key: NoiseColor; label: string }[] = [
  { key: 'white', label: 'White noise' },
  { key: 'pink', label: 'Pink noise' },
  { key: 'brown', label: 'Brown noise' },
];

export const AMBIENCE_KINDS: { key: AmbienceKind; label: string; category: AmbienceCategory }[] =
  AMBIENCE_SOURCES.map((s) => ({
    key: s.kind,
    label: s.label,
    category: s.category,
  }));

export interface LayerState {
  playing: boolean;
  volume: number;
}

export interface BirdsState extends LayerState {
  pitch: number; // 1 = natural pitch
  speed: number; // 1 = natural chirp rate
}

export interface StutterGateState {
  enabled: boolean;
  bpm: number;
}

const MAX_RECENT_LAYERS = 16;
const CUSTOM_BINAURAL_LAYER_KEY = 'binaural:custom';

function promoteRecentLayerKey(keys: string[], key: string): string[] {
  return [key, ...keys.filter((existing) => existing !== key)].slice(0, MAX_RECENT_LAYERS);
}

function playingLayerKeys(state: {
  playing: boolean;
  extraBinaural: Record<string, LayerState>;
  noise: Record<NoiseColor, LayerState>;
  ambience: Record<AmbienceKind, LayerState>;
  birds: BirdsState;
}): string[] {
  const keys: string[] = [];
  if (state.playing) keys.push(CUSTOM_BINAURAL_LAYER_KEY);
  for (const preset of WAVE_PRESETS) {
    if (state.extraBinaural[preset.key]?.playing) keys.push(`eb:${preset.key}`);
  }
  for (const noise of NOISE_COLORS) {
    if (state.noise[noise.key]?.playing) keys.push(`noise:${noise.key}`);
  }
  if (state.birds.playing) keys.push('birds');
  for (const source of AMBIENCE_SOURCES) {
    if (state.ambience[source.kind]?.playing) keys.push(`ambience:${source.kind}`);
  }
  return keys;
}

function mergeRecentLayerKeys(recentLayerKeys: string[], activeLayerKeys: string[]): string[] {
  const merged: string[] = [];
  for (const key of [...recentLayerKeys, ...activeLayerKeys]) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged.slice(0, MAX_RECENT_LAYERS);
}

interface SoundscapeState {
  // --- Master output volume (scales the whole mix uniformly) ---
  masterVolume: number;
  masterPaused: boolean;
  setMasterVolume: (v: number) => void;
  toggleMasterPlayback: () => void;
  toggleMasterPause: () => void;

  // --- Primary binaural track (drives slideshow/preset integration; unchanged behavior) ---
  beatHz: number;
  carrier: number;
  volume: number;
  playing: boolean;
  presetConfig: SoundscapeConfig | null;
  toggle: () => void;
  setBeatHz: (hz: number) => void;
  setCarrier: (hz: number) => void;
  setVolume: (v: number) => void;
  applyPresetConfig: (config: SoundscapeConfig) => void;
  applySlideConfig: (config: SoundscapeConfig | undefined) => void;

  // --- Extra binaural layers: any number of wave presets can play at once ---
  extraBinaural: Record<string, LayerState>;
  toggleExtraBinaural: (key: string) => void;
  setExtraBinauralVolume: (key: string, volume: number) => void;

  // --- Noise layers: white/pink/brown, each independently loopable ---
  noise: Record<NoiseColor, LayerState>;
  toggleNoise: (color: NoiseColor) => void;
  setNoiseVolume: (color: NoiseColor, volume: number) => void;

  // --- Nature ambience layers: forest/waterfall/waves + procedural birds ---
  ambience: Record<AmbienceKind, LayerState>;
  toggleAmbience: (kind: AmbienceKind) => void;
  setAmbienceVolume: (kind: AmbienceKind, volume: number) => void;

  birds: BirdsState;
  toggleBirds: () => void;
  setBirdsVolume: (volume: number) => void;
  setBirdsPitch: (pitch: number) => void;
  setBirdsSpeed: (speed: number) => void;

  // --- One-shot bass swipe FX (riser / drop stab) ---
  triggerBassSwipe: (direction: SweepDirection) => void;

  // --- Stutter gate: rhythmically chops the whole mix (see utils/sound-fx.ts) ---
  stutterGate: StutterGateState;
  toggleStutterGate: () => void;
  setStutterGateBpm: (bpm: number) => void;

  // --- Full-mixer presets: save/recall the entire layered mix, synced offline-first ---
  presets: SoundscapePreset[];
  loadedPresetId: string | null;
  loadedPresetName: string | null;
  loadPresetList: () => Promise<void>;
  saveCurrentAsPreset: (name: string) => Promise<SoundscapePreset>;
  applyPreset: (preset: SoundscapePreset) => void;
  loadPresetById: (id: string) => void;
  removePreset: (id: string) => Promise<void>;

  // --- Restore the mixer to how the user last left it, across reloads ---
  recentLayerKeys: string[];
  hydrateFromLastUsed: () => Promise<void>;
}

const defaultLayer = (): LayerState => ({ playing: false, volume: 0.35 });

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampVolume(value: unknown, fallback = 0.35): number {
  return Math.max(0, Math.min(1, finiteNumber(value, fallback)));
}

function normalizeLayer(layer: Partial<LayerState> | undefined): LayerState {
  return {
    playing: layer?.playing === true,
    volume: clampVolume(layer?.volume),
  };
}

function normalizeLayerRecord<K extends string>(
  keys: readonly K[],
  layers: Record<string, LayerState> | undefined,
): Record<K, LayerState> {
  const normalized = {} as Record<K, LayerState>;
  for (const key of keys) normalized[key] = normalizeLayer(layers?.[key]);
  return normalized;
}

function normalizeBirds(birds: Partial<BirdsState> | undefined): BirdsState {
  return {
    ...normalizeLayer(birds),
    pitch: finiteNumber(birds?.pitch, 1),
    speed: finiteNumber(birds?.speed, 1),
  };
}

function normalizeStutterGate(stutterGate: Partial<StutterGateState> | undefined): StutterGateState {
  return {
    enabled: stutterGate?.enabled === true,
    bpm: finiteNumber(stutterGate?.bpm, 120),
  };
}

function stopCurrentPlayback(state: SoundscapeState): void {
  if (state.playing) stopBinaural();
  for (const key of Object.keys(state.extraBinaural)) {
    if (state.extraBinaural[key].playing) stopTrack(`binaural:${key}`);
  }
  for (const color of Object.keys(state.noise) as NoiseColor[]) {
    if (state.noise[color].playing) stopTrack(`noise:${color}`);
  }
  for (const kind of Object.keys(state.ambience) as AmbienceKind[]) {
    if (state.ambience[kind].playing) stopTrack(`ambience:${kind}`);
  }
  if (state.birds.playing) stopTrack('birds');
  if (state.stutterGate.enabled) stopStutterGate();
}

function hasAudibleLayers(state: {
  playing: boolean;
  extraBinaural: Record<string, LayerState>;
  noise: Record<NoiseColor, LayerState>;
  ambience: Record<AmbienceKind, LayerState>;
  birds: BirdsState;
}): boolean {
  return playingLayerKeys(state).length > 0;
}

function startMissingPlayback(state: SoundscapeState): void {
  if (state.playing && !isBinauralPlaying()) startBinaural(state.beatHz, state.carrier, state.volume);
  for (const preset of WAVE_PRESETS) {
    const layer = state.extraBinaural[preset.key];
    const id = `binaural:${preset.key}`;
    if (layer?.playing && !isTrackPlaying(id)) startBinauralLayer(id, preset.hz, state.carrier, layer.volume);
  }
  for (const noise of NOISE_COLORS) {
    const layer = state.noise[noise.key];
    const id = `noise:${noise.key}`;
    if (layer?.playing && !isTrackPlaying(id)) startNoiseTrack(id, noise.key, layer.volume);
  }
  for (const source of AMBIENCE_SOURCES) {
    const layer = state.ambience[source.kind];
    const id = `ambience:${source.kind}`;
    if (layer?.playing && !isTrackPlaying(id)) void startAmbienceTrack(id, source.kind, layer.volume);
  }
  if (state.birds.playing && !isTrackPlaying('birds')) {
    startBirdsTrack('birds', state.birds.volume, state.birds.pitch, state.birds.speed);
  }
  if (state.stutterGate.enabled && !isStutterGateActive()) startStutterGate(state.stutterGate.bpm);
}

export const useSoundscapeStore = create<SoundscapeState>((set, get) => ({
  masterVolume: 1,
  masterPaused: false,
  recentLayerKeys: [],

  setMasterVolume: (masterVolume) => {
    set({ masterVolume });
    setMasterGain(masterVolume);
  },

  toggleMasterPlayback: () => {
    const state = get();
    const hasActiveLayers = hasAudibleLayers(state);

    if (!state.masterPaused && hasActiveLayers) {
      set({ masterPaused: true });
      setGlobalAudioPaused(true);
      stopCurrentPlayback(state);
      return;
    }

    setGlobalAudioPaused(false);

    if (state.masterPaused && hasActiveLayers) {
      set({ masterPaused: false });
      startMissingPlayback(state);
      return;
    }

    const recentLayerKeys = promoteRecentLayerKey(state.recentLayerKeys, CUSTOM_BINAURAL_LAYER_KEY);
    const playing = startBinaural(state.beatHz, state.carrier, state.volume);
    set({
      masterPaused: false,
      playing,
      recentLayerKeys: playing ? recentLayerKeys : state.recentLayerKeys,
    });
  },

  toggleMasterPause: () => get().toggleMasterPlayback(),

  beatHz: 10,
  carrier: 200,
  volume: 0.35,
  playing: false,
  presetConfig: null,

  toggle: () => {
    const { playing, beatHz, carrier, volume, masterPaused } = get();
    const recentLayerKeys = promoteRecentLayerKey(get().recentLayerKeys, CUSTOM_BINAURAL_LAYER_KEY);
    if (playing) {
      stopBinaural();
      set({ playing: false, recentLayerKeys });
    } else {
      const ok = masterPaused || startBinaural(beatHz, carrier, volume);
      if (ok) set({ playing: true, recentLayerKeys });
    }
  },

  setBeatHz: (beatHz) => {
    set({ beatHz });
    if (get().playing) updateBinaural(beatHz, get().carrier, get().volume);
  },

  setCarrier: (carrier) => {
    set({ carrier });
    if (get().playing) updateBinaural(get().beatHz, carrier, get().volume);
    // Extra binaural layers share the same carrier tone, just offset by their own beat.
    for (const preset of WAVE_PRESETS) {
      const layer = get().extraBinaural[preset.key];
      if (layer?.playing) updateBinauralLayer(`binaural:${preset.key}`, preset.hz, carrier);
    }
  },

  setVolume: (volume) => {
    set({ volume });
    if (get().playing) updateBinaural(get().beatHz, get().carrier, volume);
  },

  applyPresetConfig: (config) => {
    const beatHz = config.beatHz ?? get().beatHz;
    const carrier = config.carrier ?? get().carrier;
    const volume = config.volume ?? get().volume;
    set({ beatHz, carrier, volume, presetConfig: config });
    if (get().playing) updateBinaural(beatHz, carrier, volume);
  },

  applySlideConfig: (config) => {
    const effective = config ?? get().presetConfig;
    if (!effective) return;
    const beatHz = effective.beatHz ?? get().beatHz;
    const carrier = effective.carrier ?? get().carrier;
    const volume = effective.volume ?? get().volume;
    set({ beatHz, carrier, volume });
    if (get().playing) updateBinaural(beatHz, carrier, volume);
  },

  extraBinaural: Object.fromEntries(WAVE_PRESETS.map((p) => [p.key, defaultLayer()])),

  toggleExtraBinaural: (key) => {
    const layer = get().extraBinaural[key];
    const preset = WAVE_PRESETS.find((p) => p.key === key);
    if (!layer || !preset) return;
    const id = `binaural:${key}`;
    const recentLayerKeys = promoteRecentLayerKey(get().recentLayerKeys, `eb:${key}`);
    if (layer.playing) {
      stopTrack(id);
      set({ extraBinaural: { ...get().extraBinaural, [key]: { ...layer, playing: false } }, recentLayerKeys });
    } else {
      const ok = get().masterPaused || startBinauralLayer(id, preset.hz, get().carrier, layer.volume);
      if (ok) set({ extraBinaural: { ...get().extraBinaural, [key]: { ...layer, playing: true } }, recentLayerKeys });
    }
  },

  setExtraBinauralVolume: (key, volume) => {
    const layer = get().extraBinaural[key];
    if (!layer) return;
    set({ extraBinaural: { ...get().extraBinaural, [key]: { ...layer, volume } } });
    if (layer.playing) setTrackVolume(`binaural:${key}`, volume);
  },

  noise: {
    white: defaultLayer(),
    pink: defaultLayer(),
    brown: defaultLayer(),
  },

  toggleNoise: (color) => {
    const layer = get().noise[color];
    const id = `noise:${color}`;
    const recentLayerKeys = promoteRecentLayerKey(get().recentLayerKeys, `noise:${color}`);
    if (layer.playing) {
      stopTrack(id);
      set({ noise: { ...get().noise, [color]: { ...layer, playing: false } }, recentLayerKeys });
    } else {
      const ok = get().masterPaused || startNoiseTrack(id, color, layer.volume);
      if (ok) set({ noise: { ...get().noise, [color]: { ...layer, playing: true } }, recentLayerKeys });
    }
  },

  setNoiseVolume: (color, volume) => {
    const layer = get().noise[color];
    set({ noise: { ...get().noise, [color]: { ...layer, volume } } });
    if (layer.playing) setTrackVolume(`noise:${color}`, volume);
  },

  ambience: Object.fromEntries(AMBIENCE_SOURCES.map((s) => [s.kind, defaultLayer()])) as Record<
    AmbienceKind,
    LayerState
  >,

  toggleAmbience: (kind) => {
    const layer = get().ambience[kind];
    const id = `ambience:${kind}`;
    const recentLayerKeys = promoteRecentLayerKey(get().recentLayerKeys, `ambience:${kind}`);
    if (layer.playing) {
      stopTrack(id);
    } else if (!get().masterPaused) {
      // Fire-and-forget: the recording is fetched/decoded async, but the UI
      // toggles optimistically; a fast re-toggle is handled by the load-token
      // guard inside startAmbienceTrack.
      void startAmbienceTrack(id, kind, layer.volume);
    }
    set({ ambience: { ...get().ambience, [kind]: { ...layer, playing: !layer.playing } }, recentLayerKeys });
  },

  setAmbienceVolume: (kind, volume) => {
    const layer = get().ambience[kind];
    set({ ambience: { ...get().ambience, [kind]: { ...layer, volume } } });
    if (layer.playing) setTrackVolume(`ambience:${kind}`, volume);
  },

  birds: { playing: false, volume: 0.35, pitch: 1, speed: 1 },

  toggleBirds: () => {
    const layer = get().birds;
    const recentLayerKeys = promoteRecentLayerKey(get().recentLayerKeys, 'birds');
    if (layer.playing) {
      stopTrack('birds');
      set({ birds: { ...layer, playing: false }, recentLayerKeys });
    } else {
      const ok = get().masterPaused || startBirdsTrack('birds', layer.volume, layer.pitch, layer.speed);
      if (ok) set({ birds: { ...layer, playing: true }, recentLayerKeys });
    }
  },

  setBirdsVolume: (volume) => {
    const layer = get().birds;
    set({ birds: { ...layer, volume } });
    if (layer.playing) setTrackVolume('birds', volume);
  },

  setBirdsPitch: (pitch) => {
    const layer = get().birds;
    set({ birds: { ...layer, pitch } });
    if (layer.playing) updateBirdsTrack('birds', pitch, layer.speed);
  },

  setBirdsSpeed: (speed) => {
    const layer = get().birds;
    set({ birds: { ...layer, speed } });
    if (layer.playing) updateBirdsTrack('birds', layer.pitch, speed);
  },

  triggerBassSwipe: (direction) => {
    if (get().masterPaused) return;
    triggerBassSwipeFx(direction);
  },

  stutterGate: { enabled: false, bpm: 120 },

  toggleStutterGate: () => {
    const gate = get().stutterGate;
    if (gate.enabled) {
      stopStutterGate();
    } else if (!get().masterPaused) {
      startStutterGate(gate.bpm);
    }
    set({ stutterGate: { ...gate, enabled: !gate.enabled } });
  },

  setStutterGateBpm: (bpm) => {
    const gate = get().stutterGate;
    set({ stutterGate: { ...gate, bpm } });
    if (gate.enabled && !get().masterPaused) startStutterGate(bpm); // re-arm at the new tempo
  },

  presets: [],
  loadedPresetId: null,
  loadedPresetName: null,

  loadPresetList: async () => {
    try {
      let loaded: SoundscapePreset[];
      try {
        loaded = await loadSoundscapePresetsFromBackend(API_BASE);
        // Merge into local IndexedDB so it's available offline next time.
        for (const preset of loaded) await saveSoundscapePresetLocal(preset);
      } catch {
        loaded = await getSoundscapePresetsLocal();
      }
      set({
        presets: [...loaded].sort((a, b) => b.when_last_modified.localeCompare(a.when_last_modified)),
      });
    } catch (error) {
      console.warn('Unable to load soundscape presets:', error);
    }
  },

  saveCurrentAsPreset: async (name) => {
    const state = get();
    const now = new Date().toISOString();
    const preset: SoundscapePreset = {
      id: nanoid(),
      name,
      when_created: now,
      when_last_modified: now,
      beatHz: state.beatHz,
      carrier: state.carrier,
      volume: state.volume,
      playing: state.playing,
      extraBinaural: state.extraBinaural,
      noise: state.noise,
      ambience: state.ambience,
      birds: state.birds,
      stutterGate: state.stutterGate,
    };
    await saveSoundscapePresetOfflineFirst(preset, API_BASE);
    set({
      presets: [preset, ...get().presets],
      loadedPresetId: preset.id,
      loadedPresetName: preset.name,
    });
    return preset;
  },

  applyPreset: (preset) => {
    const state = get();
    const shouldStartAudio = !state.masterPaused;

    // Stop everything currently playing so the mix ends up matching the preset exactly.
    stopCurrentPlayback(state);

    const playing = preset.playing
      ? shouldStartAudio
        ? startBinaural(preset.beatHz, preset.carrier, preset.volume)
        : true
      : false;

    const extraBinaural: Record<string, LayerState> = {};
    for (const p of WAVE_PRESETS) {
      const layer = { ...(preset.extraBinaural[p.key] ?? defaultLayer()) };
      if (layer.playing && shouldStartAudio) {
        layer.playing = startBinauralLayer(`binaural:${p.key}`, p.hz, preset.carrier, layer.volume);
      }
      extraBinaural[p.key] = layer;
    }

    const noise = {} as Record<NoiseColor, LayerState>;
    for (const n of NOISE_COLORS) {
      const layer = { ...(preset.noise[n.key] ?? defaultLayer()) };
      if (layer.playing && shouldStartAudio) {
        layer.playing = startNoiseTrack(`noise:${n.key}`, n.key, layer.volume);
      }
      noise[n.key] = layer;
    }

    const ambience = {} as Record<AmbienceKind, LayerState>;
    for (const s of AMBIENCE_SOURCES) {
      const layer = { ...(preset.ambience[s.kind] ?? defaultLayer()) };
      if (layer.playing && shouldStartAudio) {
        void startAmbienceTrack(`ambience:${s.kind}`, s.kind, layer.volume);
      }
      ambience[s.kind] = layer;
    }

    const birds = { ...(preset.birds ?? { playing: false, volume: 0.35, pitch: 1, speed: 1 }) };
    if (birds.playing && shouldStartAudio) {
      birds.playing = startBirdsTrack('birds', birds.volume, birds.pitch, birds.speed);
    }

    const stutterGate = { ...(preset.stutterGate ?? { enabled: false, bpm: 120 }) };
    if (stutterGate.enabled && shouldStartAudio) {
      stutterGate.enabled = startStutterGate(stutterGate.bpm);
    }
    const recentLayerKeys = mergeRecentLayerKeys(
      state.recentLayerKeys,
      playingLayerKeys({ playing, extraBinaural, noise, ambience, birds }),
    );

    set({
      beatHz: preset.beatHz,
      carrier: preset.carrier,
      volume: preset.volume,
      playing,
      extraBinaural,
      noise,
      ambience,
      birds,
      stutterGate,
      recentLayerKeys,
      loadedPresetId: preset.id,
      loadedPresetName: preset.name,
    });
  },

  loadPresetById: (id) => {
    const preset = get().presets.find((p) => p.id === id);
    if (preset) get().applyPreset(preset);
  },

  removePreset: async (id) => {
    set({ presets: get().presets.filter((p) => p.id !== id) });
    if (get().loadedPresetId === id) set({ loadedPresetId: null, loadedPresetName: null });
    try {
      await deleteSoundscapePresetLocal(id);
    } catch (error) {
      console.warn('Failed to delete soundscape preset locally:', error);
    }
    try {
      await deleteSoundscapePresetFromBackend(API_BASE, id);
    } catch (error) {
      console.warn('Failed to delete soundscape preset from backend:', error);
    }
  },

  hydrateFromLastUsed: async () => {
    try {
      const last = await getLastSoundscapeState();
      if (!last) return;

      stopCurrentPlayback(get());

      const masterVolume = clampVolume(last.masterVolume, 1);
      const masterPaused = last.masterPaused === true;
      const beatHz = finiteNumber(last.beatHz, 10);
      const carrier = finiteNumber(last.carrier, 200);
      const volume = clampVolume(last.volume);

      setGlobalAudioPaused(masterPaused);
      setMasterGain(masterVolume);

      const shouldStartAudio = !masterPaused;
      const playing = last.playing
        ? shouldStartAudio
          ? startBinaural(beatHz, carrier, volume)
          : true
        : false;

      const extraBinaural = normalizeLayerRecord(
        WAVE_PRESETS.map((p) => p.key),
        last.extraBinaural,
      );
      for (const preset of WAVE_PRESETS) {
        const layer = extraBinaural[preset.key];
        if (layer.playing && shouldStartAudio) {
          layer.playing = startBinauralLayer(`binaural:${preset.key}`, preset.hz, carrier, layer.volume);
        }
      }

      const noise = normalizeLayerRecord(
        NOISE_COLORS.map((n) => n.key),
        last.noise,
      ) as SoundscapeState['noise'];
      for (const n of NOISE_COLORS) {
        const layer = noise[n.key];
        if (layer.playing && shouldStartAudio) {
          layer.playing = startNoiseTrack(`noise:${n.key}`, n.key, layer.volume);
        }
      }

      const ambience = normalizeLayerRecord(
        AMBIENCE_SOURCES.map((s) => s.kind),
        last.ambience,
      ) as SoundscapeState['ambience'];
      for (const source of AMBIENCE_SOURCES) {
        const layer = ambience[source.kind];
        if (layer.playing && shouldStartAudio) {
          void startAmbienceTrack(`ambience:${source.kind}`, source.kind, layer.volume);
        }
      }

      const birds = normalizeBirds(last.birds);
      if (birds.playing && shouldStartAudio) {
        birds.playing = startBirdsTrack('birds', birds.volume, birds.pitch, birds.speed);
      }

      const stutterGate = normalizeStutterGate(last.stutterGate);
      if (stutterGate.enabled && shouldStartAudio) {
        stutterGate.enabled = startStutterGate(stutterGate.bpm);
      }
      const recentLayerKeys = mergeRecentLayerKeys(
        last.recentLayerKeys,
        playingLayerKeys({ playing, extraBinaural, noise, ambience, birds }),
      );

      set({
        masterVolume,
        masterPaused,
        beatHz,
        carrier,
        volume,
        playing,
        extraBinaural,
        noise,
        ambience,
        birds,
        stutterGate,
        recentLayerKeys,
        loadedPresetId: last.loadedPresetId,
        loadedPresetName: last.loadedPresetName,
      });
    } catch (error) {
      console.warn('Unable to restore last-used soundscape state:', error);
    }
  },
}));

// Auto-persist the mixer's working state (debounced) so reloading the
// soundscape tab restores it via hydrateFromLastUsed above, instead of
// resetting every layer to its hard-coded default.
let lastStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
let flushLastStateSave: (() => void) | null = null;

useSoundscapeStore.subscribe(() => {
  if (lastStateSaveTimer) clearTimeout(lastStateSaveTimer);

  flushLastStateSave = () => {
    const state = useSoundscapeStore.getState();
    saveLastSoundscapeState({
      masterVolume: state.masterVolume,
      masterPaused: state.masterPaused,
      beatHz: state.beatHz,
      carrier: state.carrier,
      volume: state.volume,
      playing: state.playing,
      extraBinaural: state.extraBinaural,
      noise: state.noise,
      ambience: state.ambience,
      birds: state.birds,
      stutterGate: state.stutterGate,
      recentLayerKeys: state.recentLayerKeys,
      loadedPresetId: state.loadedPresetId,
      loadedPresetName: state.loadedPresetName,
    }).catch((error) => console.warn('Failed to persist last-used soundscape state:', error));
    flushLastStateSave = null;
  };
  lastStateSaveTimer = setTimeout(flushLastStateSave, 600);
});

// A quick reload/tab-close right after a change shouldn't lose it — flush the
// pending debounced save immediately once the page starts going away, instead
// of waiting out the rest of the 600ms window.
if (typeof window !== 'undefined') {
  const flushNow = () => {
    if (lastStateSaveTimer) clearTimeout(lastStateSaveTimer);
    flushLastStateSave?.();
  };
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}
