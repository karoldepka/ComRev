// Background music tracks, sourced from assets/music.
// Unlike ambience-tracks.ts, no license/attribution metadata is tracked here yet —
// add it if these tracks' provenance needs surfacing later.
export type MusicKind = string;

export interface MusicSource {
  kind: MusicKind;
  label: string;
  file: unknown; // require()'d audio asset module
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
];
