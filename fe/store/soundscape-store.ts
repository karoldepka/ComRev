import { create } from 'zustand';
import { nanoid } from 'nanoid/non-secure';
import { startBinaural, stopBinaural, updateBinaural } from '@/utils/binaural-engine';
import {
  startAmbienceTrack,
  startBinauralLayer,
  startBirdsTrack,
  startNoiseTrack,
  stopTrack,
  updateBinauralLayer,
  updateBirdsTrack,
  setTrackVolume,
} from '@/utils/sound-engine';
import { setMasterGain } from '@/utils/audio-context';
import type { NoiseColor } from '@/utils/noise-buffers';
import { AMBIENCE_SOURCES, type AmbienceKind, type AmbienceCategory } from '@/utils/ambience-tracks';
import {
  startStutterGate,
  stopStutterGate,
  triggerBassSwipe as triggerBassSwipeFx,
  type SweepDirection,
} from '@/utils/sound-fx';
import { API_BASE } from '@/utils/api-config';
import {
  deleteSoundscapePreset as deleteSoundscapePresetLocal,
  deleteSoundscapePresetFromBackend,
  getSoundscapePresets as getSoundscapePresetsLocal,
  loadSoundscapePresetsFromBackend,
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

interface SoundscapeState {
  // --- Master output volume (scales the whole mix uniformly) ---
  masterVolume: number;
  setMasterVolume: (v: number) => void;

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
}

const defaultLayer = (): LayerState => ({ playing: false, volume: 0.35 });

export const useSoundscapeStore = create<SoundscapeState>((set, get) => ({
  masterVolume: 1,

  setMasterVolume: (masterVolume) => {
    set({ masterVolume });
    setMasterGain(masterVolume);
  },

  beatHz: 10,
  carrier: 200,
  volume: 0.35,
  playing: false,
  presetConfig: null,

  toggle: () => {
    const { playing, beatHz, carrier, volume } = get();
    if (playing) {
      stopBinaural();
      set({ playing: false });
    } else {
      const ok = startBinaural(beatHz, carrier, volume);
      if (ok) set({ playing: true });
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
    if (layer.playing) {
      stopTrack(id);
    } else {
      startBinauralLayer(id, preset.hz, get().carrier, layer.volume);
    }
    set({ extraBinaural: { ...get().extraBinaural, [key]: { ...layer, playing: !layer.playing } } });
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
    if (layer.playing) {
      stopTrack(id);
    } else {
      startNoiseTrack(id, color, layer.volume);
    }
    set({ noise: { ...get().noise, [color]: { ...layer, playing: !layer.playing } } });
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
    if (layer.playing) {
      stopTrack(id);
    } else {
      // Fire-and-forget: the recording is fetched/decoded async, but the UI
      // toggles optimistically; a fast re-toggle is handled by the load-token
      // guard inside startAmbienceTrack.
      void startAmbienceTrack(id, kind, layer.volume);
    }
    set({ ambience: { ...get().ambience, [kind]: { ...layer, playing: !layer.playing } } });
  },

  setAmbienceVolume: (kind, volume) => {
    const layer = get().ambience[kind];
    set({ ambience: { ...get().ambience, [kind]: { ...layer, volume } } });
    if (layer.playing) setTrackVolume(`ambience:${kind}`, volume);
  },

  birds: { playing: false, volume: 0.35, pitch: 1, speed: 1 },

  toggleBirds: () => {
    const layer = get().birds;
    if (layer.playing) {
      stopTrack('birds');
    } else {
      startBirdsTrack('birds', layer.volume, layer.pitch, layer.speed);
    }
    set({ birds: { ...layer, playing: !layer.playing } });
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
    triggerBassSwipeFx(direction);
  },

  stutterGate: { enabled: false, bpm: 120 },

  toggleStutterGate: () => {
    const gate = get().stutterGate;
    if (gate.enabled) {
      stopStutterGate();
    } else {
      startStutterGate(gate.bpm);
    }
    set({ stutterGate: { ...gate, enabled: !gate.enabled } });
  },

  setStutterGateBpm: (bpm) => {
    const gate = get().stutterGate;
    set({ stutterGate: { ...gate, bpm } });
    if (gate.enabled) startStutterGate(bpm); // re-arm at the new tempo
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

    // Stop everything currently playing so the mix ends up matching the preset exactly.
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

    const playing = preset.playing && startBinaural(preset.beatHz, preset.carrier, preset.volume);

    const extraBinaural: Record<string, LayerState> = {};
    for (const p of WAVE_PRESETS) {
      const layer = preset.extraBinaural[p.key] ?? defaultLayer();
      if (layer.playing) startBinauralLayer(`binaural:${p.key}`, p.hz, preset.carrier, layer.volume);
      extraBinaural[p.key] = layer;
    }

    const noise = {} as Record<NoiseColor, LayerState>;
    for (const n of NOISE_COLORS) {
      const layer = preset.noise[n.key] ?? defaultLayer();
      if (layer.playing) startNoiseTrack(`noise:${n.key}`, n.key, layer.volume);
      noise[n.key] = layer;
    }

    const ambience = {} as Record<AmbienceKind, LayerState>;
    for (const s of AMBIENCE_SOURCES) {
      const layer = preset.ambience[s.kind] ?? defaultLayer();
      if (layer.playing) void startAmbienceTrack(`ambience:${s.kind}`, s.kind, layer.volume);
      ambience[s.kind] = layer;
    }

    const birds = preset.birds ?? { playing: false, volume: 0.35, pitch: 1, speed: 1 };
    if (birds.playing) startBirdsTrack('birds', birds.volume, birds.pitch, birds.speed);

    const stutterGate = preset.stutterGate ?? { enabled: false, bpm: 120 };
    if (stutterGate.enabled) startStutterGate(stutterGate.bpm);

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
}));
