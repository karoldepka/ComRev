import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MANTRAS } from '../slides/principles.data';
import { VIDEO_CATEGORIES } from '../slides/videos.data';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Languages expected to be fully translated (mirrors scripts/lib/videos-data.mjs's
// pre-flight recording check — 'en' is the source language and always complete).
const TRANSLATED_LANGS = ['pl', 'de', 'es', 'fr', 'it', 'pt', 'ca', 'zh'];

function loadMantrasLocale(lang: string): Record<string, string> {
  const filePath = resolve(__dirname, '..', '..', 'locales', `mantras.${lang}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

describe('mantra/video translations', () => {
  const videoTitles = VIDEO_CATEGORIES.flatMap((category) => category.videos ?? []).map((video) => video.title);

  it.each(TRANSLATED_LANGS)('has every principle title, caption, and video title translated into %s', (lang) => {
    const locale = loadMantrasLocale(lang);
    const missing: string[] = [];

    for (const [title, entry] of Object.entries(MANTRAS)) {
      if (!(title in locale)) missing.push(title);
      if (entry.examples && !(`${title}__examples` in locale)) missing.push(`${title}__examples`);
    }
    for (const title of videoTitles) {
      if (!(title in locale)) missing.push(title);
    }

    expect(missing, `Missing ${lang} translations:\n${missing.join('\n')}`).toEqual([]);
  });
});
