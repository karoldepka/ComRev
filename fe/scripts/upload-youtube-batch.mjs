#!/usr/bin/env node
/**
 * Uploads a whole batch of recorded videos (see record-videos.mjs /
 * record-obs.mjs --video all) to YouTube as Shorts, sorting them into one
 * playlist per language.
 *
 * Reuses the auth/upload/playlist functions from upload-youtube.mjs so the
 * whole batch shares a single authorized client instead of re-running the
 * OAuth consent flow per video, and expects the same
 * <dir>/<lang>/<format>/<title>.mp4 layout that script's batch (and
 * record-obs.mjs's own --video all) already write.
 *
 * Videos to upload are derived from utils/slides/videos.data.tsx (via
 * scripts/lib/videos-data.mjs), so titles/descriptions are the same declared
 * data the recordings themselves were built from — not guessed from
 * filenames.
 *
 * Resumable: records upload state in <dir>/.youtube-upload-state.json (one
 * entry per uploaded file), so re-running after an interruption skips
 * videos that already made it up.
 *
 * Usage:
 *   node scripts/upload-youtube-batch.mjs [options]
 *
 * Options:
 *   --dir <path>          Batch output directory (default: the most
 *                         recently modified ../recordings/videos_* folder)
 *   --formats <list>      Comma-separated formats to upload (default: shorts —
 *                         this script assumes vertical/Shorts-shaped video;
 *                         see the Shorts note below for other formats)
 *   --langs <list>        Comma-separated language codes (default: every
 *                         language subfolder present in --dir)
 *   --privacy <status>    private | unlisted | public (default: private —
 *                         deliberately not public; review before publishing)
 *   --dry-run             Print the upload plan without calling the API
 *   --credentials <path>  OAuth client JSON (default: scripts/.youtube-oauth-client.json)
 *   --token <path>        Cached token JSON (default: scripts/.youtube-token.json)
 *
 * Shorts note: YouTube auto-classifies a video as a Short when it's
 * vertical/square and at most 3 minutes long; having "#Shorts" in the title
 * or description helps it classify reliably for videos uploaded via the API
 * (as opposed to recorded in the mobile Shorts camera), so this script adds
 * it to the description automatically.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  DEFAULT_CREDENTIALS_PATH,
  DEFAULT_TOKEN_PATH,
  addVideoToPlaylist,
  findOrCreatePlaylist,
  getAuthorizedClient,
  getGoogleApis,
  parseArgs,
  uploadVideo,
} from "./upload-youtube.mjs";
import { fileNameFromTitle, loadVideos, titleForLang } from "./lib/videos-data.mjs";
import { musicCreditLine, musicKindForVideoIndex } from "./lib/music-attribution.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECORDINGS_ROOT = resolve(__dirname, "..", "..", "recordings");

// Mirrors utils/i18n.ts's SUPPORTED_LANGUAGES labels — duplicated rather than
// transpiling that module (which also pulls in expo-localization) for Node,
// same reasoning as MUSIC_FILES in scripts/lib/audio-mix.mjs.
const LANG_NAMES = {
  en: "English", pl: "Polski", de: "Deutsch", it: "Italiano", fr: "Français",
  ca: "Català", zh: "中文", pt: "Português", es: "Español", hi: "हिन्दी",
  ar: "العربية", fa: "فارسی",
};

function splitList(value) {
  return value && value !== true
    ? String(value).split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
}

/** Picks the most recently modified `videos_*` folder under recordings/. */
function findLatestBatchDir() {
  if (!existsSync(RECORDINGS_ROOT)) {
    console.error(`No recordings directory found at ${RECORDINGS_ROOT}. Pass --dir <path> explicitly.`);
    process.exit(1);
  }
  const candidates = readdirSync(RECORDINGS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("videos_"))
    .map((e) => join(RECORDINGS_ROOT, e.name));
  if (candidates.length === 0) {
    console.error(`No videos_* batch folders found under ${RECORDINGS_ROOT}. Pass --dir <path> explicitly.`);
    process.exit(1);
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0];
}

function detectLangs(batchDir) {
  return readdirSync(batchDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** Builds the description for one video: the principles it covers (from the
 * same declared data the video itself was built from), a #Shorts hint, and a
 * credit line for the CC-BY background track the recording used (required by
 * the license — see scripts/lib/music-attribution.mjs). */
function buildDescription(video, lang, videoIndex) {
  const principleList = video.principleTitles
    .map((title, i) => `${i + 1}. ${titleForLang(title, lang)}`)
    .join("\n");
  const credit = musicCreditLine(musicKindForVideoIndex(videoIndex));
  return `${principleList}\n\n#Shorts #ComRev${credit ? `\n\n${credit}` : ""}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const batchDir = args.dir && args.dir !== true ? resolve(args.dir) : findLatestBatchDir();
  if (!existsSync(batchDir)) {
    console.error(`Batch directory not found: ${batchDir}`);
    process.exit(1);
  }
  const formats = splitList(args.formats) ?? ["shorts"];
  const requestedLangs = splitList(args.langs);
  const langs = requestedLangs ?? detectLangs(batchDir);
  const privacyStatus = args.privacy && args.privacy !== true ? args.privacy : "private";
  if (!["private", "unlisted", "public"].includes(privacyStatus)) {
    console.error(`Invalid --privacy "${privacyStatus}". Use private, unlisted, or public.`);
    process.exit(1);
  }
  const dryRun = args["dry-run"] === true;
  const credentialsPath = resolve(args.credentials && args.credentials !== true ? args.credentials : DEFAULT_CREDENTIALS_PATH);
  const tokenPath = resolve(args.token && args.token !== true ? args.token : DEFAULT_TOKEN_PATH);

  const declaredVideos = loadVideos();

  // Build the job list from declared video data + what's actually on disk —
  // not from blindly globbing the folder, so titles/descriptions come from
  // the same source of truth the recordings themselves were built from.
  const jobs = [];
  for (const lang of langs) {
    for (const format of formats) {
      declaredVideos.forEach((video, videoIndex) => {
        const fileName = `${fileNameFromTitle(titleForLang(video.title, lang))}.mp4`;
        const filePath = join(batchDir, lang, format, fileName);
        if (existsSync(filePath)) {
          jobs.push({ video, videoIndex, lang, format, filePath, title: titleForLang(video.title, lang) });
        }
      });
    }
  }

  const statePath = join(batchDir, ".youtube-upload-state.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

  const pending = jobs.filter((j) => !state[j.filePath]?.videoId);

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  YouTube Batch Upload");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Batch dir : ${batchDir}`);
  console.log(`  Formats   : ${formats.join(", ")}`);
  console.log(`  Languages : ${langs.join(", ")}`);
  console.log(`  Privacy   : ${privacyStatus}`);
  console.log(`  Total     : ${jobs.length} video(s) found, ${jobs.length - pending.length} already uploaded, ${pending.length} to upload`);
  if (dryRun) console.log("\n  *** DRY RUN — no uploads will be made ***");
  console.log("══════════════════════════════════════════════════════════\n");

  if (jobs.length === 0) {
    console.log("Nothing to do — no matching video files found under the batch directory.");
    return;
  }

  if (dryRun) {
    jobs.forEach((j, i) => {
      const done = state[j.filePath]?.videoId ? " (already uploaded)" : "";
      console.log(`  ${String(i + 1).padStart(3)}. [${j.lang}/${j.format}] ${j.title}${done}`);
    });
    console.log("");
    return;
  }

  const { google } = await getGoogleApis();
  const auth = await getAuthorizedClient(google, credentialsPath, tokenPath);
  const youtube = google.youtube({ version: "v3", auth });

  // One playlist per language, created once and reused across the batch (and
  // across re-runs — findOrCreatePlaylist matches on exact title).
  const playlistIdByLang = {};
  for (const lang of langs) {
    const name = `ComRev — ${LANG_NAMES[lang] ?? lang} Shorts`;
    console.log(`Ensuring playlist "${name}"...`);
    playlistIdByLang[lang] = await findOrCreatePlaylist(youtube, {
      title: name,
      description: `Auto-generated by upload-youtube-batch.mjs — ComRev principle videos in ${LANG_NAMES[lang] ?? lang}.`,
      privacyStatus,
    });
    console.log(`  -> ${playlistIdByLang[lang]}`);
  }

  const wallStart = Date.now();
  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const job = pending[i];
    const jobNum = `[${i + 1}/${pending.length}]`;
    console.log(`\n${"─".repeat(62)}`);
    console.log(`${jobNum} [${job.lang}/${job.format}] ${job.title}`);
    console.log(`${"─".repeat(62)}`);

    try {
      const sizeMb = (statSync(job.filePath).size / 1024 / 1024).toFixed(1);
      console.log(`  File: ${job.filePath}  (${sizeMb} MB)`);
      console.log("  Uploading...");
      const { videoId, url } = await uploadVideo(youtube, {
        filePath: job.filePath,
        title: job.title,
        description: buildDescription(job.video, job.lang, job.videoIndex),
        tags: ["shorts", "psychology", "mentalmodels", job.lang],
        categoryId: "27", // Education
        privacyStatus,
        madeForKids: false,
      });
      process.stdout.write("\n");
      console.log(`  ✓ Uploaded: ${url}`);

      await addVideoToPlaylist(youtube, videoId, playlistIdByLang[job.lang]);
      console.log(`  ✓ Added to "ComRev — ${LANG_NAMES[job.lang] ?? job.lang} Shorts"`);

      state[job.filePath] = { videoId, url, lang: job.lang, format: job.format, uploadedAt: new Date().toISOString() };
      saveState();
      uploaded++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
    }
  }

  const wallSec = ((Date.now() - wallStart) / 1000).toFixed(0);
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  Batch upload complete");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Done in : ${Math.floor(wallSec / 60)}m ${wallSec % 60}s`);
  console.log(`  Uploaded: ${uploaded} / ${pending.length}`);
  if (failed) console.log(`  Failed  : ${failed}`);
  console.log(`  State   : ${statePath}`);
  console.log("══════════════════════════════════════════════════════════\n");

  if (failed) process.exitCode = 1;
}

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
