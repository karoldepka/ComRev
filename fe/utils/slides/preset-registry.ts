import type { SoundscapeConfig } from '@/store/soundscape-store';
import type { EffectInstance } from '@/utils/config-store';
import i18n from '@/utils/i18n';
import type { MusicKind } from '@/utils/music-tracks';
import { estimateReadingTimeMs, SEQUENCE_DURATION_SCALE } from '@/utils/reading-time';
import { stripBoldTags, wrapRichTextWords } from '@/utils/rich-text';
import { nanoid } from 'nanoid/non-secure';
import type { MantraEntry, MantraText } from './mcon.data';
import { MANTRAS as MCON_MANTRAS } from './mcon.data';
import { MANTRAS as MOTIVATION_MANTRAS } from './motivation.data';
import { MANTRAS as PRINCIPLES_MANTRAS } from './principles.data';
import { MANTRAS as QUOTES_MANTRAS } from './quotes.data';
import { VIDEO_CATEGORIES } from './videos.data';

export type { SoundscapeConfig };

export interface SlideEntry {
  id: string;
  name: string;
  text: string;
  author?: string;
  /** Short explanatory caption, rendered smaller than the main slide text. */
  examples?: string;
  /** Fixed display duration for this slide, bypassing the usual word-count estimate (e.g. a title card). */
  durationMsOverride?: number;
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
  /** 3D scene background color as a hex number (e.g. 0xffffff for white); overrides the default black. Useful for A/B-testing preset variants. */
  background?: number;
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

/**
 * Set by the recording harness (see app/preset/[id]/full-window.tsx) to learn
 * about a translation key that i18n silently fell back to English for —
 * "silently" being the problem: without this, a video recorded for language X
 * can end up showing English content with no indication anything went wrong.
 */
type MissingTranslationListener = (key: string, lang: string) => void;
let missingTranslationListener: MissingTranslationListener | null = null;
export function setMissingTranslationListener(listener: MissingTranslationListener | null): void {
  missingTranslationListener = listener;
}

function reportIfMissing(key: string, lang: string | undefined): void {
  if (!lang || lang === 'en' || !missingTranslationListener) return;
  if (i18n.exists(key, { ns: 'mantras', lng: lang, keySeparator: false })) return;
  missingTranslationListener(key, lang);
}

/**
 * Set by the recording harness (see app/preset/[id]/full-window.tsx) to learn
 * which background-music track a preset wants — the site no longer plays it
 * live (see the TRANSITION_SOUND_VARIANTS comment in three-d.tsx for why),
 * so the recorder needs this reported out-of-band to mix it into the video
 * during post-processing instead.
 */
type AudioConfigListener = (music: MusicKind | undefined) => void;
let audioConfigListener: AudioConfigListener | null = null;
export function setAudioConfigListener(listener: AudioConfigListener | null): void {
  audioConfigListener = listener;
}
export function reportAudioConfig(music: MusicKind | undefined): void {
  audioConfigListener?.(music);
}

function getMantraSlideText(
  title: string,
  entry: MantraEntry,
  lang?: string,
): string {
  const fallback =
    entry.text === undefined ? title : normalizeMantraText(entry.text);
  reportIfMissing(title, lang);
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

/** Translated caption ("examples"), looked up under `${title}__examples` — a separate key from the title itself so both can be translated independently. */
function getMantraExamples(
  title: string,
  entry: MantraEntry,
  lang?: string,
): string | undefined {
  if (entry.examples === undefined) return undefined;
  if (!lang) return entry.examples;
  reportIfMissing(`${title}__examples`, lang);
  return i18n.t(`${title}__examples`, {
    ns: 'mantras',
    lng: lang,
    keySeparator: false,
    defaultValue: entry.examples,
  });
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
      examples: getMantraExamples(title, entry, lang),
    }));
}

/** Like makeSlides, but for an explicit ordered subset of keys (e.g. a curated video) rather than the whole map. Unknown keys are skipped. */
function makeSlidesFromKeys(
  prefix: string,
  mantras: Record<string, MantraEntry>,
  keys: readonly string[],
  lang?: string,
): SlideEntry[] {
  return keys
    .filter((title) => title in mantras)
    .map((title) => {
      const entry = mantras[title];
      return {
        id: `${prefix}-${nanoid()}`,
        name: stripBoldTags(title),
        text: getMantraSlideText(title, entry, lang),
        author: entry.author,
        examples: getMantraExamples(title, entry, lang),
      };
    });
}

function makeTitleSlide(id: string, title: string, lang?: string): SlideEntry {
  reportIfMissing(title, lang);
  const raw = lang
    ? i18n.t(title, {
        ns: 'mantras',
        lng: lang,
        keySeparator: false,
        defaultValue: title,
      })
    : title;
  const text = wrapMantraText(raw);
  return {
    id,
    name: 'Title',
    text,
    // Reading-speed formula, not a fixed guess — see estimateReadingTimeMs.
    // No CAPTION_REVEAL_DELAY_MS floor here: title-only slides have no
    // caption, so there's nothing to wait for a reveal. Scaled by the same
    // SEQUENCE_DURATION_SCALE as regular content slides (three-d.tsx) so the
    // intro title isn't left at full length while the rest of the video sped up.
    durationMsOverride: Math.round(estimateReadingTimeMs(text) * SEQUENCE_DURATION_SCALE),
  };
}

const PRINCIPLES_TITLE = '7 psychological principles to make you smarter';

function getPrinciplesTitleSlide(lang?: string): SlideEntry {
  return makeTitleSlide('principles-title', PRINCIPLES_TITLE, lang);
}

// Shared by `principles` and its A/B-test variants below — only visual
// styling (e.g. background) should differ between them, so the content and
// pacing config lives in one place.
const principlesBase: Omit<PresetDefinition, 'label' | 'background'> = {
  soundscape: { beatHz: 10, carrier: 200, volume: 0.35 }, // alpha — relaxed focus
  music: 'oceanking-patents',
  // No fixed floor here: estimateSequenceDurationMs already guarantees each
  // slide stays up for CAPTION_REVEAL_DELAY_MS + however long its own caption
  // takes to read (see app/(tabs)/three-d.tsx), which scales with content
  // instead of forcing every slide — even a one-word caption — to a flat 10s.
  // At the "7 slides" a Short typically shows, that flat floor alone pushed a
  // ~48s video (in the ideal 30-60s Shorts retention window) to ~72s.
  generateSlides: (lang?: string, categories?: readonly string[]) => [
    getPrinciplesTitleSlide(lang),
    ...makeSlides('principles', PRINCIPLES_MANTRAS, lang, categories),
  ],
};

// Auto-generated from videos.data.tsx: one recordable preset per declared
// video, e.g. `preset/video-smarter-7/full-window`. All current videos draw
// their principles from principles.data.tsx, so they reuse principlesBase's
// soundscape/music rather than repeating it per video.
const videoPresetEntries: Record<string, PresetDefinition> = {};
for (const category of VIDEO_CATEGORIES) {
  for (const video of category.videos) {
    const presetId = `video-${video.id}`;
    videoPresetEntries[presetId] = {
      label: `${category.label}: ${video.title}`,
      soundscape: principlesBase.soundscape,
      music: principlesBase.music,
      generateSlides: (lang?: string) => [
        makeTitleSlide(`${presetId}-title`, video.title, lang),
        ...makeSlidesFromKeys(presetId, PRINCIPLES_MANTRAS, Object.keys(video.principles), lang),
      ],
    };
  }
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
    ...principlesBase,
  },
  // A/B-test variant: identical content and pacing, white background instead
  // of the default black — record both and compare retention/CTR.
  'principles-white': {
    label: 'Principles (White BG)',
    ...principlesBase,
    background: 0xffffff,
  },
  ...videoPresetEntries,
};
