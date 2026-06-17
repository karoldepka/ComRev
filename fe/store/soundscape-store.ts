import { create } from 'zustand';
import { startBinaural, stopBinaural, updateBinaural } from '@/utils/binaural-engine';

export interface SoundscapeConfig {
  beatHz?: number;    // 0 or absent = off
  carrier?: number;   // default 200 Hz
  volume?: number;    // 0–1, default 0.35
}

interface SoundscapeState {
  beatHz: number;
  carrier: number;
  volume: number;
  playing: boolean;
  /** Baseline set by the last applyPresetConfig call; used as fallback when a slide has no override. */
  presetConfig: SoundscapeConfig | null;
  // Call toggle() directly from a click/tap handler so AudioContext can unlock.
  toggle: () => void;
  setBeatHz: (hz: number) => void;
  setCarrier: (hz: number) => void;
  setVolume: (v: number) => void;
  applyPresetConfig: (config: SoundscapeConfig) => void;
  applySlideConfig: (config: SoundscapeConfig | undefined) => void;
}

export const useSoundscapeStore = create<SoundscapeState>((set, get) => ({
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
}));
