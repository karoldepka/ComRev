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
 * How much every slide's reading-time-derived duration is compressed by —
 * shared so the intro title slide (utils/slides/preset-registry.ts, via a
 * fixed durationMsOverride) shrinks by the same fraction as regular content
 * slides (app/(tabs)/three-d.tsx's estimateSequenceDurationMs), instead of
 * only the latter shrinking and the title card being left at full length.
 * History: 0.8 (20% shorter) -> 0.4 (2x shorter again) -> this (1.5x shorter again).
 */
export const SEQUENCE_DURATION_SCALE = 0.4 / 1.5;
