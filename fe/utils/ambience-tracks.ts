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
  {
    kind: 'rain',
    label: 'Rain',
    file: require('@/assets/sounds/rain-ambience.mp3'),
    title: 'Looping Rain On Skylight Foley Texture',
    author: 'deadrobotmusic',
    sourceUrl: 'https://freesound.org/people/deadrobotmusic/sounds/663947/',
    license: 'CC0',
  },
  {
    kind: 'thunderstorm',
    label: 'Thunderstorm',
    file: require('@/assets/sounds/thunderstorm-ambience.mp3'),
    title: 'Thunderstorm with rain (loop)',
    author: 'VKProduktion',
    sourceUrl: 'https://freesound.org/people/VKProduktion/sounds/704603/',
    license: 'CC0',
  },
  {
    kind: 'campfire',
    label: 'Campfire',
    file: require('@/assets/sounds/campfire-ambience.mp3'),
    title: 'fire-crackling.wav',
    author: 'jmehlferber',
    sourceUrl: 'https://freesound.org/people/jmehlferber/sounds/370938/',
    license: 'CC0',
  },
  {
    kind: 'river',
    label: 'River stream',
    file: require('@/assets/sounds/river-ambience.mp3'),
    title: 'Relaxing river stream running water seamless loop',
    author: 'steaq',
    sourceUrl: 'https://freesound.org/people/steaq/sounds/548767/',
    license: 'CC0',
  },
  {
    kind: 'wind',
    label: 'Wind',
    file: require('@/assets/sounds/wind-ambience.mp3'),
    title: 'Howling Wind Ambience',
    author: 'DBlover',
    sourceUrl: 'https://freesound.org/people/DBlover/sounds/405601/',
    license: 'CC0',
  },
  {
    kind: 'crickets',
    label: 'Night crickets',
    file: require('@/assets/sounds/crickets-ambience.mp3'),
    title: 'Night Crickets Ambience on Rural Property',
    author: 'OwlStorm',
    sourceUrl: 'https://freesound.org/people/OwlStorm/sounds/320145/',
    license: 'CC0',
  },
  {
    kind: 'cave',
    label: 'Cave drips',
    file: require('@/assets/sounds/cave-ambience.mp3'),
    title: 'Ambiance_Atmosphere_Cave_Loop_Stereo',
    author: 'Nox_Sound',
    sourceUrl: 'https://freesound.org/people/Nox_Sound/sounds/553080/',
    license: 'CC0',
  },
  {
    kind: 'coffeeShop',
    label: 'Coffee shop',
    file: require('@/assets/sounds/coffee-shop-ambience.mp3'),
    title: 'coffee shop ambience',
    author: 'waweee',
    sourceUrl: 'https://freesound.org/people/waweee/sounds/370973/',
    license: 'CC0',
  },
  {
    kind: 'train',
    label: 'Train',
    file: require('@/assets/sounds/train-ambience.mp3'),
    title: 'Train Rumble and Rattle',
    author: 'ProductionNow',
    sourceUrl: 'https://freesound.org/s/455045/',
    license: 'CC0',
  },
  {
    kind: 'traffic',
    label: 'City traffic',
    file: require('@/assets/sounds/traffic-ambience.mp3'),
    title: 'City Traffic Ambience',
    author: 'DataJuggler',
    sourceUrl: 'https://freesound.org/people/DataJuggler/sounds/750144/',
    license: 'CC0',
  },
  {
    kind: 'windChimes',
    label: 'Wind chimes',
    file: require('@/assets/sounds/wind-chimes-ambience.mp3'),
    title: 'Wind Chimes (No Background Noise)',
    author: 'mooncubedesign',
    sourceUrl: 'https://freesound.org/people/mooncubedesign/sounds/440929/',
    license: 'CC0',
  },
  {
    kind: 'snow',
    label: 'Snow storm',
    file: require('@/assets/sounds/snow-ambience.mp3'),
    title: 'Howling winter storm ambient sounds',
    author: 'DBlover',
    sourceUrl: 'https://freesound.org/people/DBlover/sounds/505999/',
    license: 'CC0',
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
