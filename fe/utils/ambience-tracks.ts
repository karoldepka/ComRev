// Real field recordings for nature ambience, sourced from freesound.org.
// Metadata here is the single source of truth for both playback (sound-engine.ts)
// and the in-app attributions popover (components/sound-attributions-popover.tsx) —
// keeping them in sync so a CC-BY credit can never silently go missing.
import type { AmbienceKind } from './sound-engine';

export type SoundLicense = 'CC0' | 'CC-BY-4.0';

export interface AmbienceSource {
  kind: AmbienceKind;
  label: string;
  file: unknown; // require()'d audio asset module
  title: string;
  author: string;
  sourceUrl: string;
  license: SoundLicense;
}

export const AMBIENCE_SOURCES: AmbienceSource[] = [
  {
    kind: 'forest',
    label: 'Forest',
    file: require('@/assets/sounds/forest-ambience.mp3'),
    title: 'Windy Autumn Forest Soundscape 2',
    author: 'Porphyr',
    sourceUrl: 'https://freesound.org/people/Porphyr/sounds/209339/',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'waterfall',
    label: 'Waterfall',
    file: require('@/assets/sounds/waterfall-ambience.mp3'),
    title: 'Ambiance_Waterfall_Loop_04',
    author: 'Nox_Sound',
    sourceUrl: 'https://freesound.org/people/Nox_Sound/sounds/511075/',
    license: 'CC0',
  },
  {
    kind: 'waves',
    label: 'Water waves',
    file: require('@/assets/sounds/waves-ambience.mp3'),
    title: 'Ocean Waves Loop - Day',
    author: 'Koops',
    sourceUrl: 'https://freesound.org/people/Koops/sounds/586117/',
    license: 'CC-BY-4.0',
  },
];

export const ATTRIBUTION_REQUIRED_SOUNDS = AMBIENCE_SOURCES.filter((s) => s.license !== 'CC0');

export function resolveAssetUri(mod: unknown): string {
  if (typeof mod === 'string') return mod;
  const asAny = mod as any;
  if (asAny?.default) return resolveAssetUri(asAny.default);
  if (asAny?.uri) return asAny.uri;
  return String(mod);
}
