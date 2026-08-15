#!/usr/bin/env node
/**
 * Uploads a video to YouTube via the YouTube Data API v3.
 *
 * One-time setup (you have to do this yourself — it needs your own Google
 * account and a Google Cloud project; no part of it can be scripted here):
 *   1. Go to https://console.cloud.google.com/ and create (or pick) a project.
 *   2. APIs & Services → Library → enable "YouTube Data API v3".
 *   3. APIs & Services → OAuth consent screen → configure it (External is fine
 *      for personal use; add yourself as a test user if it stays in "Testing").
 *   4. APIs & Services → Credentials → Create Credentials → OAuth client ID →
 *      Application type "Desktop app". Download the JSON.
 *   5. Save that JSON as scripts/.youtube-oauth-client.json (already
 *      gitignored — never commit it) or pass --credentials <path>.
 *
 * First run opens a consent URL for you to visit in a browser; after you
 * approve, it's redirected to a one-shot local server this script starts,
 * which captures the code and exchanges it for tokens. The refresh token is
 * then cached in scripts/.youtube-token.json (also gitignored) so future runs
 * don't need to re-consent.
 *
 * The auth/upload/playlist functions below are also imported directly by
 * scripts/upload-youtube-batch.mjs, so a whole batch of uploads shares one
 * authorized client instead of re-running the OAuth flow per video.
 *
 * Usage:
 *   node scripts/upload-youtube.mjs --file <path> [options]
 *
 * Options:
 *   --file <path>          Video file to upload (required)
 *   --title <text>         Video title (default: filename without extension)
 *   --description <text>   Video description (default: empty)
 *   --tags <a,b,c>          Comma-separated tags
 *   --category <id>         YouTube category ID (default: 27 "Education")
 *   --privacy <status>      private | unlisted | public (default: private —
 *                           deliberately not public; pass this explicitly to
 *                           publish immediately)
 *   --playlist <id>         Add the uploaded video to this playlist ID after upload
 *   --made-for-kids         Mark as made for kids (default: not)
 *   --credentials <path>    OAuth client JSON (default: scripts/.youtube-oauth-client.json)
 *   --token <path>          Cached token JSON (default: scripts/.youtube-token.json)
 */

import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { createServer } from "http";
import { basename, dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

export const __dirname = dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        result[key] = true;
      } else {
        result[key] = next;
        i++;
      }
    }
  }
  return result;
}

export const DEFAULT_CREDENTIALS_PATH = `${__dirname}/.youtube-oauth-client.json`;
export const DEFAULT_TOKEN_PATH = `${__dirname}/.youtube-token.json`;

/** Dynamically imports googleapis with a friendly error if it's not installed
 * (kept optional — nothing else in the app needs it). */
export async function getGoogleApis() {
  try {
    return await import("googleapis");
  } catch {
    console.error(
      "The googleapis package is not installed. Run:\n" +
      "  npm install --save-dev googleapis\n" +
      "then try again.",
    );
    process.exit(1);
  }
}

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

/** Tiny one-shot local HTTP server that captures the OAuth redirect's "code" param. */
function startOAuthCallbackServer(port) {
  return new Promise((resolveCode, rejectCode) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(error
        ? `<html><body>Authorization failed: ${error}. You can close this tab.</body></html>`
        : "<html><body>Authorized — you can close this tab and return to the terminal.</body></html>");
      server.close();
      if (error) rejectCode(new Error(`OAuth error: ${error}`));
      else if (code) resolveCode(code);
      else rejectCode(new Error("No authorization code in callback."));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** Loads the OAuth client JSON and validates it looks right. */
export function loadClientConfig(credentialsPath) {
  if (!existsSync(credentialsPath)) {
    console.error(
      `OAuth client credentials not found at: ${credentialsPath}\n` +
      "See the setup steps at the top of this file (Google Cloud Console →\n" +
      "OAuth client ID → Desktop app → download JSON) and save it there,\n" +
      "or pass --credentials <path>.",
    );
    process.exit(1);
  }
  const { installed, web } = JSON.parse(readFileSync(credentialsPath, "utf8"));
  const clientConfig = installed ?? web;
  if (!clientConfig) {
    console.error(`${credentialsPath} doesn't look like an OAuth client JSON (no "installed" or "web" key).`);
    process.exit(1);
  }
  return clientConfig;
}

/** Returns an authorized OAuth2 client, reusing a cached token if present,
 * otherwise walking the user through the consent flow once. */
export async function getAuthorizedClient(google, credentialsPath = DEFAULT_CREDENTIALS_PATH, tokenPath = DEFAULT_TOKEN_PATH) {
  const clientConfig = loadClientConfig(credentialsPath);
  const redirectPort = 53_682; // arbitrary fixed loopback port; must match a redirect URI registered on the OAuth client
  const redirectUri = `http://127.0.0.1:${redirectPort}/oauth2callback`;
  const oauth2Client = new google.auth.OAuth2(clientConfig.client_id, clientConfig.client_secret, redirectUri);

  if (existsSync(tokenPath)) {
    oauth2Client.setCredentials(JSON.parse(readFileSync(tokenPath, "utf8")));
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
  console.log("\nNo cached token found. Open this URL, sign in, and approve access:\n");
  console.log(`  ${authUrl}\n`);
  console.log(`Waiting for the redirect to ${redirectUri} ...`);

  const code = await startOAuthCallbackServer(redirectPort);
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`Token cached at ${tokenPath} — future runs won't need to re-authorize.\n`);
  return oauth2Client;
}

/**
 * Uploads one video file. Returns { videoId, url }.
 * @param {import('googleapis').youtube_v3.Youtube} youtube
 */
export async function uploadVideo(youtube, {
  filePath, title, description = "", tags = [], categoryId = "27",
  privacyStatus = "private", madeForKids = false, onProgress,
}) {
  const fileSize = statSync(filePath).size;
  let lastLoggedPercent = -1;
  const res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description, tags, categoryId },
        status: { privacyStatus, selfDeclaredMadeForKids: madeForKids },
      },
      media: { body: createReadStream(filePath) },
    },
    {
      onUploadProgress: (evt) => {
        const percent = Math.round((evt.bytesRead / fileSize) * 100);
        if (percent !== lastLoggedPercent) {
          lastLoggedPercent = percent;
          (onProgress ?? ((p) => process.stdout.write(`\r  ${p}%`)))(percent);
        }
      },
    },
  );
  const videoId = res.data.id;
  return { videoId, url: `https://youtu.be/${videoId}` };
}

export async function addVideoToPlaylist(youtube, videoId, playlistId) {
  await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    },
  });
}

/**
 * Finds a playlist owned by the authorized user with an exact title match,
 * or creates one if none exists. Returns the playlist ID either way — used
 * so re-running a batch upload doesn't create duplicate "language" playlists.
 */
export async function findOrCreatePlaylist(youtube, { title, description = "", privacyStatus = "private" }) {
  let pageToken;
  do {
    const res = await youtube.playlists.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      pageToken,
    });
    const match = res.data.items?.find((p) => p.snippet?.title === title);
    if (match) return match.id;
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const res = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title, description },
      status: { privacyStatus },
    },
  });
  return res.data.id;
}

// ── CLI entry (single-file upload) ──────────────────────────────────────────

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file || args.file === true) {
    console.error("Missing --file <path to video>.");
    process.exit(1);
  }

  const filePath = resolve(args.file);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const title = args.title && args.title !== true ? args.title : basename(filePath).replace(/\.[^.]+$/, "");
  const description = args.description && args.description !== true ? args.description : "";
  const tags = args.tags && args.tags !== true
    ? String(args.tags).split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const categoryId = args.category && args.category !== true ? String(args.category) : "27"; // Education
  const privacyStatus = args.privacy && args.privacy !== true ? args.privacy : "private";
  if (!["private", "unlisted", "public"].includes(privacyStatus)) {
    console.error(`Invalid --privacy "${privacyStatus}". Use private, unlisted, or public.`);
    process.exit(1);
  }
  const playlistId = args.playlist && args.playlist !== true ? args.playlist : undefined;
  const madeForKids = args["made-for-kids"] === true;
  const credentialsPath = resolve(args.credentials && args.credentials !== true
    ? args.credentials
    : DEFAULT_CREDENTIALS_PATH);
  const tokenPath = resolve(args.token && args.token !== true
    ? args.token
    : DEFAULT_TOKEN_PATH);

  const { google } = await getGoogleApis();

  const fileSizeMb = (statSync(filePath).size / 1024 / 1024).toFixed(1);
  console.log("\n══════════════════════════════════════════");
  console.log("  YouTube Upload");
  console.log("══════════════════════════════════════════");
  console.log(`  File     : ${filePath}  (${fileSizeMb} MB)`);
  console.log(`  Title    : ${title}`);
  console.log(`  Privacy  : ${privacyStatus}`);
  console.log(`  Category : ${categoryId}`);
  if (tags.length) console.log(`  Tags     : ${tags.join(", ")}`);
  if (playlistId) console.log(`  Playlist : ${playlistId}`);
  console.log("══════════════════════════════════════════\n");

  const auth = await getAuthorizedClient(google, credentialsPath, tokenPath);
  const youtube = google.youtube({ version: "v3", auth });

  console.log("Uploading...");
  const { videoId, url } = await uploadVideo(youtube, {
    filePath, title, description, tags, categoryId, privacyStatus, madeForKids,
  });
  process.stdout.write("\n");
  console.log(`\n✓ Uploaded: ${url}`);

  if (playlistId) {
    console.log(`Adding to playlist ${playlistId}...`);
    try {
      await addVideoToPlaylist(youtube, videoId, playlistId);
      console.log("✓ Added to playlist.");
    } catch (err) {
      console.warn("Could not add to playlist:", err.message);
    }
  }
}
