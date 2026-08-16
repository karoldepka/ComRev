/**
 * Mirrors utils/music-tracks.ts's MUSIC_SOURCES declaration order and
 * attribution fields — duplicated here (rather than transpiling that module
 * for Node) same reasoning as MUSIC_FILES in audio-mix.mjs. Used by
 * upload-youtube-batch.mjs to credit each video's CC-BY track in its
 * description (freesound.org would have been CC0 but requires a login to
 * download, so these are sourced from incompetech.com under CC-BY-4.0 instead
 * — see the license field below).
 *
 * MUSIC_ORDER must stay in the exact same order as MUSIC_SOURCES in
 * utils/music-tracks.ts — utils/slides/preset-registry.ts assigns each
 * declared video a track by cycling through that array by index, and this
 * list has to reproduce the same assignment to credit the right track.
 */
export const MUSIC_ORDER = [
  'oceanking-patents',
  'oceanking-street-lights',
  'almost-in-f',
  'ambiment',
  'bathed-in-the-light',
  'chill-wave',
  'fluidscape',
  'light-awash',
  'magic-forest',
  'perspectives',
  'silver-blue-light',
  'tranquility-base',
  'at-rest',
  'clear-waters',
  'concentration',
  'deep-relaxation',
  'healing',
  'heartwarming',
  'peace-of-mind',
  'soaring',
];

// Unverified provenance (oceanking-*) is omitted rather than guessed — see
// utils/music-tracks.ts's MusicSource comment.
export const MUSIC_ATTRIBUTION = {
  'almost-in-f': { title: 'Almost in F', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Almost%20in%20F.mp3' },
  'ambiment': { title: 'Ambiment', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ambiment.mp3' },
  'bathed-in-the-light': { title: 'Bathed in the Light', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bathed%20in%20the%20Light.mp3' },
  'chill-wave': { title: 'Chill Wave', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Chill%20Wave.mp3' },
  'fluidscape': { title: 'Fluidscape', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluidscape.mp3' },
  'light-awash': { title: 'Light Awash', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Light%20Awash.mp3' },
  'magic-forest': { title: 'Magic Forest', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Magic%20Forest.mp3' },
  'perspectives': { title: 'Perspectives', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Perspectives.mp3' },
  'silver-blue-light': { title: 'Silver Blue Light', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Silver%20Blue%20Light.mp3' },
  'tranquility-base': { title: 'Tranquility Base', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Tranquility%20Base.mp3' },
  'at-rest': { title: 'At Rest', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/At%20Rest.mp3' },
  'clear-waters': { title: 'Clear Waters', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Clear%20Waters.mp3' },
  'concentration': { title: 'Concentration', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Concentration.mp3' },
  'deep-relaxation': { title: 'Deep Relaxation', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Deep%20Relaxation.mp3' },
  'healing': { title: 'Healing', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Healing.mp3' },
  'heartwarming': { title: 'Heartwarming', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Heartwarming.mp3' },
  'peace-of-mind': { title: 'Peace of Mind', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Peace%20of%20Mind.mp3' },
  'soaring': { title: 'Soaring', author: 'Kevin MacLeod', license: 'CC BY 4.0', sourceUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Soaring.mp3' },
};

/** Reproduces preset-registry.ts's `MUSIC_SOURCES[videoIndex % MUSIC_SOURCES.length]`
 * per-video track assignment, so uploads credit the same track a recording
 * actually used. `videoIndex` must be the video's 0-based position in
 * loadVideos()'s return order (same VIDEO_CATEGORIES flatten order preset-registry.ts loops over). */
export function musicKindForVideoIndex(videoIndex) {
  return MUSIC_ORDER[videoIndex % MUSIC_ORDER.length];
}

/** One-line credit for a track's description, or null if it needs none
 * (CC0 / unverified-provenance tracks aren't required to be credited). */
export function musicCreditLine(kind) {
  const attribution = MUSIC_ATTRIBUTION[kind];
  if (!attribution) return null;
  return `Music: "${attribution.title}" by ${attribution.author} (incompetech.com) — ${attribution.license} https://creativecommons.org/licenses/by/4.0/`;
}
