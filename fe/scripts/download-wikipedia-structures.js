#!/usr/bin/env node
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const fetch = globalThis.fetch || require('node-fetch');

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'ComRevStructureDownloader/1.0 (+https://github.com)';

function parseArgs(argv) {
  const args = [...argv];
  const options = { outDir: './downloads/wikipedia-structures', substances: [] };

  let index = 0;
  while (index < args.length) {
    const item = args[index];
    if (item === '--outDir' && index + 1 < args.length) {
      options.outDir = args[index + 1];
      index += 2;
      continue;
    }
    if (item.startsWith('--')) {
      index += 1;
      continue;
    }
    options.substances.push(item);
    index += 1;
  }

  return options;
}

async function fetchJson(params) {
  const url = `${WIKI_API}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Wikipedia API failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function resolvePageTitle(term) {
  const exact = await fetchJson({ action: 'query', titles: term, prop: 'info', formatversion: '2' });
  const page = exact.query?.pages?.[0];
  if (page && !page.missing) {
    return page.title;
  }

  const search = await fetchJson({ action: 'query', list: 'search', srsearch: term, srlimit: '5', formatversion: '2' });
  const first = search.query?.search?.[0];
  if (first) {
    return first.title;
  }

  throw new Error(`Could not resolve Wikipedia page for '${term}'.`);
}

function filterSvgFiles(images, term) {
  const svgImages = images.filter((image) => image.title.toLowerCase().endsWith('.svg'));
  if (svgImages.length === 0) {
    return [];
  }

  const lowerTerm = term.toLowerCase();
  const keywords = ['skeletal', 'structure', 'formula', 'chemical', 'mol', 'psychedelic', 'drug', 'molecule', 'shulgin'];

  const prioritized = svgImages.filter((image) => {
    const lower = image.title.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword)) && lower.includes(lowerTerm);
  });
  if (prioritized.length > 0) {
    return prioritized;
  }

  const matchedByName = svgImages.filter((image) => image.title.toLowerCase().includes(lowerTerm));
  if (matchedByName.length > 0) {
    return matchedByName;
  }

  return svgImages;
}

async function getSvgFileUrl(fileTitle) {
  const info = await fetchJson({ action: 'query', titles: fileTitle, prop: 'imageinfo', iiprop: 'url', formatversion: '2' });
  const page = info.query?.pages?.[0];
  const imageinfo = page?.imageinfo?.[0];
  if (!imageinfo?.url) {
    throw new Error(`Could not resolve URL for ${fileTitle}`);
  }
  return imageinfo.url;
}

async function getPageSvgUrl(pageTitle, term) {
  const imagesRes = await fetchJson({ action: 'query', prop: 'images', titles: pageTitle, imlimit: 'max', formatversion: '2' });
  const page = imagesRes.query?.pages?.[0];
  const images = page?.images || [];
  const candidates = filterSvgFiles(images, term);
  if (candidates.length === 0) {
    return null;
  }
  return getSvgFileUrl(candidates[0].title);
}

async function fetchHtmlPage(pageTitle) {
  const result = await fetchJson({ action: 'parse', page: pageTitle, prop: 'text', formatversion: '2' });
  return result.parse?.text?.['*'] || '';
}

function extractSvgUrlFromHtml(html) {
  const matches = Array.from(html.matchAll(/https?:\/\/upload\.wikimedia\.org\/[^"'\s>]*\.svg\b/gi));
  return matches.length > 0 ? matches[0][0] : null;
}

async function downloadFile(url, targetPath) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  await writeFile(targetPath, Buffer.from(buffer));
}

async function downloadStructure(term, outDir) {
  const pageTitle = await resolvePageTitle(term);
  console.log(`Resolved '${term}' to Wikipedia page '${pageTitle}'.`);

  let svgUrl = await getPageSvgUrl(pageTitle, term);
  if (!svgUrl) {
    const html = await fetchHtmlPage(pageTitle);
    svgUrl = extractSvgUrlFromHtml(html);
  }

  if (!svgUrl) {
    throw new Error(`No SVG structure found for ${term} on page ${pageTitle}.`);
  }

  const fileName = `${term.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.svg`;
  const targetPath = path.join(outDir, fileName);
  await downloadFile(svgUrl, targetPath);
  console.log(`Saved ${term} SVG to ${targetPath}`);
}

async function main() {
  const { outDir, substances } = parseArgs(process.argv.slice(2));
  if (!substances.length) {
    console.error('Usage: node scripts/download-wikipedia-structures.js [--outDir path] "LSD" "Psilocybin"');
    process.exit(1);
  }

  const destination = path.resolve(outDir);
  await mkdir(destination, { recursive: true });

  for (const term of substances) {
    try {
      await downloadStructure(term, destination);
    } catch (error) {
      console.error(`Failed to download ${term}:`, error.message || error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
