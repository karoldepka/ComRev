/**
 * Shared loader for utils/slides/videos.data.tsx — the declarative source of
 * truth for which principle subsets make up each recordable "video". Used by
 * both record-obs.mjs (single recording, --video <id>) and record-videos.mjs
 * (batch recording across all declared videos).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const typescript = require('typescript');

/** Transpiles and evaluates a .tsx data file that contains only type imports
 * and plain data, without needing the app's bundler. */
function loadTsDataModule(relPath) {
  const filePath = resolve(__dirname, '..', '..', relPath);
  const source = readFileSync(filePath, 'utf8');
  const { outputText } = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    // Data files may re-export from path-aliased modules (e.g. principles.data.tsx
    // re-exporting MCON_VISUAL_PARAMS from '@/utils/mcon.config'); those aliases
    // aren't resolvable outside the app's bundler, and nothing this loader reads
    // needs their values, so swallow the failure instead of resolving for real.
    require: (id) => { try { return require(id); } catch { return {}; } },
  };
  vm.runInNewContext(outputText, context, { filename: filePath });
  return module.exports;
}

/**
 * Loads VIDEO_CATEGORIES from videos.data.tsx directly. The file currently
 * contains only type imports and data, so TypeScript can transpile it without
 * the app's bundler; the resulting CommonJS module is evaluated in a sandbox
 * that exposes no Node globals.
 */
export function loadVideos() {
  const categories = loadTsDataModule('utils/slides/videos.data.tsx').VIDEO_CATEGORIES;
  if (!Array.isArray(categories)) {
    throw new Error('videos.data.tsx must export VIDEO_CATEGORIES as an array.');
  }

  const videos = categories.flatMap((category) => category.videos ?? []).map((video) => {
    const source = video.source === 'quotes' ? 'quotes' : 'principles';
    const principleTitles = Object.keys(source === 'quotes' ? (video.quotes ?? {}) : (video.principles ?? {}));
    if (!video.id || !video.title || principleTitles.length === 0) {
      throw new Error('Each video must have an id, title, and at least one principle.');
    }
    return { id: video.id, title: video.title, source, principleCount: principleTitles.length, principleTitles };
  });
  if (new Set(videos.map((video) => video.id)).size !== videos.length) {
    throw new Error('Video ids in videos.data.tsx must be unique.');
  }
  return videos;
}

let principlesCache = null;

/** Loads MANTRAS from principles.data.tsx — the canonical title -> {examples} map. */
function loadPrinciples() {
  if (!principlesCache) {
    principlesCache = loadTsDataModule('utils/slides/principles.data.tsx').MANTRAS ?? {};
  }
  return principlesCache;
}

let quotesCache = null;

/** Loads MANTRAS from quotes.data.tsx — the canonical quote-text -> {author} map. */
function loadQuotes() {
  if (!quotesCache) {
    quotesCache = loadTsDataModule('utils/slides/quotes.data.tsx').MANTRAS ?? {};
  }
  return quotesCache;
}

let mconCache = null;

/** Loads MANTRAS from mcon.data.tsx — the canonical mantra-text -> {examples} map. */
function loadMcon() {
  if (!mconCache) {
    mconCache = loadTsDataModule('utils/slides/mcon.data.tsx').MANTRAS ?? {};
  }
  return mconCache;
}

let motivationCache = null;

/** Loads MANTRAS from motivation.data.tsx — the canonical mantra-text -> {examples} map. */
function loadMotivation() {
  if (!motivationCache) {
    motivationCache = loadTsDataModule('utils/slides/motivation.data.tsx').MANTRAS ?? {};
  }
  return motivationCache;
}

/** Maps a whole-collection preset id (see utils/slides/preset-registry.ts's
 * PRESET_REGISTRY) to its MANTRAS loader — used by record-all.mjs, which
 * (unlike record-videos.mjs's curated video subsets) records every entry in
 * the collection, so completeness has to be checked against the whole map. */
const PRESET_MANTRA_LOADERS = {
  mcon: loadMcon,
  motivation: loadMotivation,
  quotes: loadQuotes,
  principles: loadPrinciples,
  'principles-white': loadPrinciples,
};

/**
 * Checks that every string a recording of `preset` in `lang` will actually
 * display — every entry's title, and its examples caption when it has one —
 * exists in locales/mantras.<lang>.json. 'en' is the source language and is
 * always considered complete. Returns the list of missing translation keys
 * (empty when fully covered, or when `preset` isn't a whole-collection
 * preset this checker knows about).
 */
export function missingPresetTranslations(preset, lang) {
  if (!lang || lang === 'en') return [];
  const loader = PRESET_MANTRA_LOADERS[preset];
  if (!loader) return [];
  const mantras = loadMantras(lang);
  const entries = loader();

  const requiredKeys = [];
  for (const [title, entry] of Object.entries(entries)) {
    requiredKeys.push(title);
    if (entry?.examples) requiredKeys.push(`${title}__examples`);
  }

  return requiredKeys.filter((key) => !(key in mantras));
}

/** Looks up a single declared video by id, throwing with the full valid-id list if not found. */
export function findVideo(id) {
  const videos = loadVideos();
  const video = videos.find((v) => v.id === id);
  if (!video) {
    throw new Error(`Unknown video id "${id}". Available: ${videos.map((v) => v.id).join(', ')}`);
  }
  return video;
}

const INVALID_FILENAME_CHARS = new RegExp('[<>:"/\\\\|?*\\x00-\\x1F]', 'g');

/** Preserve the readable title while removing characters invalid in file names. */
export function fileNameFromTitle(title) {
  return title
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/[. ]+$/g, '') || 'untitled-video';
}

const mantrasCache = new Map();

function loadMantras(lang) {
  if (mantrasCache.has(lang)) return mantrasCache.get(lang);
  const filePath = resolve(__dirname, '..', '..', `locales/mantras.${lang}.json`);
  let data = {};
  if (existsSync(filePath)) {
    try {
      data = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.warn(`Could not parse ${filePath}: ${err.message}`);
    }
  }
  mantrasCache.set(lang, data);
  return data;
}

/**
 * Localized title for a video, so filenames match the language being
 * recorded. locales/mantras.<lang>.json keys translations by the raw English
 * title (keySeparator:false, same convention the app itself uses); falls
 * back to the English title for 'en', for languages without a mantras file
 * (e.g. hi, ar), or for a title that isn't in the translation file.
 */
export function titleForLang(title, lang) {
  if (!lang || lang === 'en') return title;
  const mantras = loadMantras(lang);
  return mantras[title] ?? title;
}

/**
 * Checks that every string a recording of `video` in `lang` will actually
 * display — the video title, each principle's title, and each principle's
 * examples caption (when it has one) — exists in locales/mantras.<lang>.json.
 * 'en' is the source language and is always considered complete. Returns the
 * list of missing translation keys (empty when fully covered).
 */
export function missingTranslations(video, lang) {
  if (!lang || lang === 'en') return [];
  const mantras = loadMantras(lang);
  const entries = video.source === 'quotes' ? loadQuotes() : loadPrinciples();

  const requiredKeys = [video.title];
  for (const title of video.principleTitles) {
    requiredKeys.push(title);
    const examples = entries[title]?.examples;
    if (examples) requiredKeys.push(`${title}__examples`);
  }

  return requiredKeys.filter((key) => !(key in mantras));
}
