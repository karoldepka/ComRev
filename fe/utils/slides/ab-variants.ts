// A/B-test variants for recorded videos — a lightweight, named set of pacing/
// music overrides layered on top of whatever preset is being recorded,
// selected via a `variant` URL/CLI param rather than duplicating a whole
// preset (or a whole video) per variant. See usePresetLoader for where these
// are applied, and scripts/record-videos.mjs's --variants for batch recording.
export interface AbVariant {
  id: string;
  label: string;
  /** Overrides the per-slide minimum-duration floor (preset.sequenceLineDurationMs / DEFAULT_SEQUENCE_LINE_DURATION_MS). */
  sequenceLineDurationMs?: number;
  /** Overrides the title slide's fixed duration (normally clamped into TITLE_SLIDE_DURATION_MS_RANGE). */
  titleSlideDurationMs?: number;
  /** Shifts the preset's music pick this many tracks forward in MUSIC_SOURCES, so the same video sounds different per variant instead of using the exact preset-assigned track. */
  musicOffset?: number;
}

export const AB_VARIANTS: Record<string, AbVariant> = {
  default: {
    id: 'default',
    label: 'Default pacing',
  },
  fast: {
    id: 'fast',
    label: 'Fast pacing',
    sequenceLineDurationMs: 400,
    titleSlideDurationMs: 2000,
    musicOffset: 1,
  },
  slow: {
    id: 'slow',
    label: 'Slow pacing',
    sequenceLineDurationMs: 900,
    titleSlideDurationMs: 3500,
    musicOffset: 2,
  },
};

export const DEFAULT_AB_VARIANT_ID = 'default';

export function resolveAbVariant(id?: string | null): AbVariant {
  return (id && AB_VARIANTS[id]) || AB_VARIANTS[DEFAULT_AB_VARIANT_ID];
}
