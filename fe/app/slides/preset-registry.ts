import { nanoid } from 'nanoid/non-secure';
import type { MantraEntry, MantraText } from './mcon.data';
import { MANTRAS as MCON_MANTRAS } from './mcon.data';
import { MANTRAS as MOTIVATION_MANTRAS } from './motivation.data';

export interface SlideEntry {
  id: string;
  name: string;
  text: string;
}

export interface PresetDefinition {
  label: string;
  generateSlides: (lang?: string) => SlideEntry[];
}

// ── mcon helpers ──────────────────────────────────────────────────────────────

function normalizeMantraText(mantra: MantraText): string {
  return Array.isArray(mantra) ? mantra.join('\n') : mantra;
}

function wrapMantraText(text: string, maxChars = 12): string {
  if (text.includes('\n')) return text;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function getMantraSlideText(title: string, entry: MantraEntry, lang?: string): string {
  const translated = lang ? (entry.translations?.[lang] ?? undefined) : undefined;
  const raw = translated !== undefined
    ? normalizeMantraText(translated)
    : entry.text === undefined ? title : normalizeMantraText(entry.text);
  return wrapMantraText(raw);
}

// ── Registry ──────────────────────────────────────────────────────────────────

function makeSlides(prefix: string, mantras: Record<string, MantraEntry>, lang?: string): SlideEntry[] {
  return Object.entries(mantras).map(([title, entry]) => ({
    id: `${prefix}-${nanoid()}`,
    name: title,
    text: getMantraSlideText(title, entry, lang),
  }));
}

export const PRESET_REGISTRY: Record<string, PresetDefinition> = {
  mcon: {
    label: 'Mantras',
    generateSlides: (lang?: string) => makeSlides('mcon', MCON_MANTRAS, lang),
  },
  motivation: {
    label: 'Motivation',
    generateSlides: (lang?: string) => makeSlides('motivation', MOTIVATION_MANTRAS, lang),
  },
};
