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
