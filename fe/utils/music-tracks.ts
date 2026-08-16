// Background music tracks, sourced from assets/music.
import type { SoundLicense } from '@/utils/ambience-tracks';

export type MusicKind = string;

export interface MusicSource {
  kind: MusicKind;
  label: string;
  file: unknown; // require()'d audio asset module
  // Unverified provenance (pre-dates attribution tracking) — omitted rather
  // than guessed. Every track added going forward should have these filled in.
  title?: string;
  author?: string;
  sourceUrl?: string;
  license?: SoundLicense;
}

export const MUSIC_SOURCES: MusicSource[] = [
  {
    kind: 'oceanking-patents',
    label: 'Patents',
    file: require('@/assets/music/oceanking-patents-219735.mp3'),
  },
  {
    kind: 'oceanking-street-lights',
    label: 'Street Lights',
    file: require('@/assets/music/oceanking-street-lights-219744.mp3'),
  },
  {
    kind: 'almost-in-f',
    label: 'Almost in F',
    file: require('@/assets/music/almost-in-f.mp3'),
    title: 'Almost in F',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Almost%20in%20F.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'ambiment',
    label: 'Ambiment',
    file: require('@/assets/music/ambiment.mp3'),
    title: 'Ambiment',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ambiment.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'bathed-in-the-light',
    label: 'Bathed in the Light',
    file: require('@/assets/music/bathed-in-the-light.mp3'),
    title: 'Bathed in the Light',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bathed%20in%20the%20Light.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'chill-wave',
    label: 'Chill Wave',
    file: require('@/assets/music/chill-wave.mp3'),
    title: 'Chill Wave',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Chill%20Wave.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'fluidscape',
    label: 'Fluidscape',
    file: require('@/assets/music/fluidscape.mp3'),
    title: 'Fluidscape',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluidscape.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'light-awash',
    label: 'Light Awash',
    file: require('@/assets/music/light-awash.mp3'),
    title: 'Light Awash',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Light%20Awash.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'magic-forest',
    label: 'Magic Forest',
    file: require('@/assets/music/magic-forest.mp3'),
    title: 'Magic Forest',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Magic%20Forest.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'perspectives',
    label: 'Perspectives',
    file: require('@/assets/music/perspectives.mp3'),
    title: 'Perspectives',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Perspectives.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'silver-blue-light',
    label: 'Silver Blue Light',
    file: require('@/assets/music/silver-blue-light.mp3'),
    title: 'Silver Blue Light',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Silver%20Blue%20Light.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'tranquility-base',
    label: 'Tranquility Base',
    file: require('@/assets/music/tranquility-base.mp3'),
    title: 'Tranquility Base',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Tranquility%20Base.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'at-rest',
    label: 'At Rest',
    file: require('@/assets/music/at-rest.mp3'),
    title: 'At Rest',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/At%20Rest.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'clear-waters',
    label: 'Clear Waters',
    file: require('@/assets/music/clear-waters.mp3'),
    title: 'Clear Waters',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Clear%20Waters.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'concentration',
    label: 'Concentration',
    file: require('@/assets/music/concentration.mp3'),
    title: 'Concentration',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Concentration.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'deep-relaxation',
    label: 'Deep Relaxation',
    file: require('@/assets/music/deep-relaxation.mp3'),
    title: 'Deep Relaxation',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Deep%20Relaxation.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'healing',
    label: 'Healing',
    file: require('@/assets/music/healing.mp3'),
    title: 'Healing',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Healing.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'heartwarming',
    label: 'Heartwarming',
    file: require('@/assets/music/heartwarming.mp3'),
    title: 'Heartwarming',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Heartwarming.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'peace-of-mind',
    label: 'Peace of Mind',
    file: require('@/assets/music/peace-of-mind.mp3'),
    title: 'Peace of Mind',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Peace%20of%20Mind.mp3',
    license: 'CC-BY-4.0',
  },
  {
    kind: 'soaring',
    label: 'Soaring',
    file: require('@/assets/music/soaring.mp3'),
    title: 'Soaring',
    author: 'Kevin MacLeod',
    sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Soaring.mp3',
    license: 'CC-BY-4.0',
  },
];

/** Shifts `kind` forward `offset` tracks through MUSIC_SOURCES (wrapping),
 * used by A/B variants to give the same video a different track without
 * hand-assigning one per variant. Unknown kind or zero offset returns kind as-is. */
export function shiftMusicKind(kind: MusicKind | undefined, offset: number): MusicKind | undefined {
  if (!kind || !offset) return kind;
  const index = MUSIC_SOURCES.findIndex((m) => m.kind === kind);
  if (index === -1) return kind;
  const length = MUSIC_SOURCES.length;
  return MUSIC_SOURCES[((index + offset) % length + length) % length].kind;
}
