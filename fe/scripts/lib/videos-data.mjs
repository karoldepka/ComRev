/**
 * Shared loader for utils/slides/videos.data.tsx — the declarative source of
 * truth for which principle subsets make up each recordable "video". Used by
 * both record-obs.mjs (single recording, --video <id>) and record-videos.mjs
 * (batch recording across all declared videos).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const typescript = require('typescript');

/**
 * Loads VIDEO_CATEGORIES from videos.data.tsx directly. The file currently
 * contains only type imports and data, so TypeScript can transpile it without
 * the app's bundler; the resulting CommonJS module is evaluated in a sandbox
 * that exposes no Node globals.
 */
export function loadVideos() {
  const filePath = resolve(__dirname, '..', '..', 'utils/slides/videos.data.tsx');
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
  vm.runInNewContext(outputText, { module, exports: module.exports }, { filename: filePath });

  const categories = module.exports.VIDEO_CATEGORIES;
  if (!Array.isArray(categories)) {
    throw new Error('videos.data.tsx must export VIDEO_CATEGORIES as an array.');
  }

  const videos = categories.flatMap((category) => category.videos ?? []).map((video) => {
    const principleCount = Object.keys(video.principles ?? {}).length;
    if (!video.id || !video.title || principleCount === 0) {
      throw new Error('Each video must have an id, title, and at least one principle.');
    }
    return { id: video.id, title: video.title, principleCount };
  });
  if (new Set(videos.map((video) => video.id)).size !== videos.length) {
    throw new Error('Video ids in videos.data.tsx must be unique.');
  }
  return videos;
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
