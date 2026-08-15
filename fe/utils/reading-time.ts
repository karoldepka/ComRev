/**
 * Rough reading-speed estimate for on-screen title/caption text: ~36ms per
 * character plus ~95ms per word (together landing around 200-plus words per
 * minute, a typical adult silent-reading pace), with a small trailing pause
 * for terminal punctuation. Shared by the sequence-duration estimate
 * (app/(tabs)/three-d.tsx) and any slide that needs a duration computed from
 * its own text rather than a fixed override (utils/slides/preset-registry.ts).
 */
export function estimateReadingTimeMs(text: string): number {
  const clean = text.trim();
  const words = clean.split(/\s+/).filter(Boolean).length;
  const punctuationBonus = /[.!?;:]$/.test(clean) ? 450 : 0;
  return clean.length * 36 + words * 95 + punctuationBonus;
}

/**
 * How much every regular content slide's reading-time-derived duration is
 * compressed by (app/(tabs)/three-d.tsx's estimateSequenceDurationMs). Does
 * NOT apply to the intro title slide — see TITLE_SLIDE_DURATION_MS_RANGE
 * below; scaling the title down by the same aggressive fraction as a 2-3
 * word content slide made it flash by unreadably fast.
 * History: 0.8 (20% shorter) -> 0.4 (2x shorter again) -> 0.4/1.5 (1.5x
 * shorter again) -> this (2x shorter again).
 */
export const SEQUENCE_DURATION_SCALE = 0.4 / 3;

/**
 * The intro title slide (utils/slides/preset-registry.ts's makeTitleSlide)
 * is a whole video title, not a 2-3 word content slide, so it gets its own
 * fixed floor/ceiling instead of SEQUENCE_DURATION_SCALE — long enough to
 * actually read, short enough not to drag.
 */
export const TITLE_SLIDE_DURATION_MS_RANGE = { min: 2000, max: 4000 };
