import type { SoundscapeConfig } from '@/store/soundscape-store';
import type { EffectInstance } from '@/utils/config-store';
import i18n from '@/utils/i18n';
import type { MusicKind } from '@/utils/music-tracks';
import { stripBoldTags, wrapRichTextWords } from '@/utils/rich-text';
import { nanoid } from 'nanoid/non-secure';
import type { MantraEntry, MantraText } from './mcon.data';
import { MANTRAS as MCON_MANTRAS } from './mcon.data';
import { MANTRAS as MOTIVATION_MANTRAS } from './motivation.data';
import { MANTRAS as PRINCIPLES_MANTRAS } from './principles.data';
import { MANTRAS as QUOTES_MANTRAS } from './quotes.data';

export type { SoundscapeConfig };

export interface SlideEntry {
  id: string;
  name: string;
  text: string;
  author?: string;
  /** Short explanatory caption, rendered smaller than the main slide text. */
  examples?: string;
  /** Overrides the preset-level soundscape for this specific slide. */
  soundscape?: SoundscapeConfig;
  /** Overrides the full effect pipeline for this specific slide. Off by default (null/undefined = use global). */
  configOverride?: { effectInstances?: EffectInstance[] };
}

export interface PresetDefinition {
  label: string;
  soundscape?: SoundscapeConfig;
  /** Background music (from assets/music) to start playing when this preset loads. */
  music?: MusicKind;
  /** Minimum time each slide stays on screen; overrides the app-wide default for this preset. */
  sequenceLineDurationMs?: number;
  generateSlides: (
    lang?: string,
    categories?: readonly string[],
  ) => SlideEntry[];
}

export function parseCategoriesParam(value?: string | string[]): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value;
  return [
    ...new Set(
      raw
        ?.split(',')
        .map((category) => category.trim())
        .filter(Boolean) ?? [],
    ),
  ];
}

// ── mcon helpers ──────────────────────────────────────────────────────────────

function normalizeMantraText(mantra: MantraText): string {
  return typeof mantra === 'string' ? mantra : mantra.join('\n');
}

function wrapMantraText(text: string, maxChars = 12): string {
  if (text.includes('\n')) return text;
  return wrapRichTextWords(text, maxChars);
}

function getMantraSlideText(
  title: string,
  entry: MantraEntry,
  lang?: string,
): string {
  const fallback =
    entry.text === undefined ? title : normalizeMantraText(entry.text);
  const raw = lang
    ? i18n.t(title, {
        ns: 'mantras',
        lng: lang,
        keySeparator: false,
        defaultValue: fallback,
      })
    : fallback;
  return wrapMantraText(raw);
}

// ── Registry ──────────────────────────────────────────────────────────────────

function makeSlides(
  prefix: string,
  mantras: Record<string, MantraEntry>,
  lang?: string,
  categories: readonly string[] = [],
): SlideEntry[] {
  return Object.entries(mantras)
    .filter(([, entry]) =>
      categories.length === 0
        ? true
        : categories.some((category) => category in (entry.categories ?? {})),
    )
    .map(([title, entry]) => ({
      id: `${prefix}-${nanoid()}`,
      name: stripBoldTags(title),
      text: getMantraSlideText(title, entry, lang),
      author: entry.author,
      examples: entry.examples,
    }));
}

export const PRESET_REGISTRY: Record<string, PresetDefinition> = {
  mcon: {
    label: 'Mantras',
    soundscape: { beatHz: 10, carrier: 200, volume: 0.35 }, // alpha — relaxed focus
    generateSlides: (lang?: string, categories?: readonly string[]) =>
      makeSlides('mcon', MCON_MANTRAS, lang, categories),
  },
  motivation: {
    label: 'Motivation',
    soundscape: { beatHz: 40, carrier: 200, volume: 0.3 }, // gamma — peak performance
    generateSlides: (lang?: string, categories?: readonly string[]) =>
      makeSlides('motivation', MOTIVATION_MANTRAS, lang, categories),
  },
  quotes: {
    label: 'Quotes',
    soundscape: { beatHz: 10, carrier: 200, volume: 0.35 }, // alpha — relaxed focus
    generateSlides: (lang?: string, categories?: readonly string[]) =>
      makeSlides('quotes', QUOTES_MANTRAS, lang, categories),
  },
  principles: {
    label: 'Principles',
    soundscape: { beatHz: 10, carrier: 200, volume: 0.35 }, // alpha — relaxed focus
    music: 'oceanking-patents',
    // Long enough to read the title, then the 3D caption that reveals below it.
    sequenceLineDurationMs: 10000,
    generateSlides: (lang?: string, categories?: readonly string[]) =>
      makeSlides('principles', PRINCIPLES_MANTRAS, lang, categories),
  },
};
