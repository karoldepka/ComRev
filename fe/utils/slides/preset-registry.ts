import type { SoundscapeConfig } from "@/store/soundscape-store";
import type { EffectInstance } from "@/utils/config-store";
import i18n from "@/utils/i18n";
import { nanoid } from "nanoid/non-secure";
import type { MantraEntry, MantraText } from "./mcon.data";
import { MANTRAS as MCON_MANTRAS } from "./mcon.data";
import { MANTRAS as MOTIVATION_MANTRAS } from "./motivation.data";

export type { SoundscapeConfig };

export interface SlideEntry {
  id: string;
  name: string;
  text: string;
  author?: string;
  /** Overrides the preset-level soundscape for this specific slide. */
  soundscape?: SoundscapeConfig;
  /** Overrides the full effect pipeline for this specific slide. Off by default (null/undefined = use global). */
  configOverride?: { effectInstances?: EffectInstance[] };
}

export interface PresetDefinition {
  label: string;
  soundscape?: SoundscapeConfig;
  generateSlides: (lang?: string) => SlideEntry[];
}

// ── mcon helpers ──────────────────────────────────────────────────────────────

function normalizeMantraText(mantra: MantraText): string {
  return Array.isArray(mantra) ? mantra.join("\n") : mantra;
}

function wrapMantraText(text: string, maxChars = 12): string {
  if (text.includes("\n")) return text;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
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
        ns: "mantras",
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
): SlideEntry[] {
  return Object.entries(mantras).map(([title, entry]) => ({
    id: `${prefix}-${nanoid()}`,
    name: title,
    text: getMantraSlideText(title, entry, lang),
  }));
}

export const PRESET_REGISTRY: Record<string, PresetDefinition> = {
  mcon: {
    label: "Mantras",
    soundscape: { beatHz: 10, carrier: 200, volume: 0.35 }, // alpha — relaxed focus
    generateSlides: (lang?: string) => makeSlides("mcon", MCON_MANTRAS, lang),
  },
  motivation: {
    label: "Motivation",
    soundscape: { beatHz: 40, carrier: 200, volume: 0.3 }, // gamma — peak performance
    generateSlides: (lang?: string) =>
      makeSlides("motivation", MOTIVATION_MANTRAS, lang),
  },
};
