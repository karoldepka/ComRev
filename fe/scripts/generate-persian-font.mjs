#!/usr/bin/env node
/**
 * Converts a Persian/Arabic TrueType font into three.js's typeface.json
 * format (see node_modules/three/examples/jsm/loaders/FontLoader.js for the
 * authoritative glyph-outline grammar this replicates: `m`/`l`/`q dest,ctrl`/
 * `b dest,ctrl1,ctrl2`, all in raw font units — FontLoader scales by
 * `size / data.resolution` itself, so `resolution` here is set to the font's
 * own unitsPerEm and coordinates are left unscaled).
 *
 * three.js's TextGeometry renders each character as its own glyph outline —
 * it has no Arabic/Persian contextual shaping or RTL reordering. Vazirmatn
 * (like most Arabic-script fonts) ships pre-shaped isolated/initial/medial/
 * final glyphs addressable by their own Unicode Arabic Presentation Forms
 * codepoints (U+FB50-FDFF, U+FE70-FEFF), so as long as the *text* fed into
 * createTextGeometry has already been run through a shaper (see
 * utils/persian-text.ts) that picks the right presentation-form codepoint
 * per letter and reverses the result for RTL, plain per-codepoint
 * TextGeometry renders correctly-joined Persian. This script just needs to
 * carry those presentation-form glyphs (plus the base Arabic block, Persian
 * digits, and basic Latin/punctuation for mixed content) into typeface.json.
 *
 * Usage:
 *   node scripts/generate-persian-font.mjs --in <path-to-Vazirmatn-Regular.ttf> --out assets/fonts/Vazirmatn_Regular.typeface.json
 *
 * Vazirmatn is SIL Open Font License 1.1 (see the font's own OFL.txt) —
 * https://github.com/rastikerdar/vazirmatn
 */

import { readFileSync, writeFileSync } from 'fs';
import opentype from 'opentype.js';

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') opts.in = argv[++i];
    else if (argv[i] === '--out') opts.out = argv[++i];
  }
  if (!opts.in || !opts.out) {
    console.error('Usage: node scripts/generate-persian-font.mjs --in <ttf> --out <typeface.json>');
    process.exit(1);
  }
  return opts;
}

// Codepoint ranges to carry over, in addition to '?' (fallback glyph, see
// FontLoader.js's `data.glyphs[char] || data.glyphs['?']`) and space/newline.
const RANGES = [
  [0x0020, 0x007e], // basic Latin (letters, digits, punctuation) for mixed content
  [0x00a0, 0x00ff], // Latin-1 Supplement: « » and other punctuation used in Persian text
  [0x0600, 0x06ff], // Arabic block: Persian letters, Arabic-Indic + Extended (Farsi) digits
  [0x0750, 0x077f], // Arabic Supplement
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A (includes ligatures)
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B (the isolated/initial/medial/final shapes)
  [0x200c, 0x200f], // ZWNJ, ZWJ, LRM, RLM — used to control Persian joining/direction
  [0x2010, 0x2027], // general punctuation incl. en/em dash, curly quotes, ellipsis
];

function numToStr(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

function outlineToPathString(path) {
  const tokens = [];
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M':
        tokens.push('m', numToStr(cmd.x), numToStr(cmd.y));
        break;
      case 'L':
        tokens.push('l', numToStr(cmd.x), numToStr(cmd.y));
        break;
      case 'Q':
        // typeface.json order is dest, then control point (opposite of opentype's x1,y1,x,y).
        tokens.push('q', numToStr(cmd.x), numToStr(cmd.y), numToStr(cmd.x1), numToStr(cmd.y1));
        break;
      case 'C':
        // typeface.json order is dest, then ctrl1, then ctrl2.
        tokens.push(
          'b', numToStr(cmd.x), numToStr(cmd.y),
          numToStr(cmd.x1), numToStr(cmd.y1),
          numToStr(cmd.x2), numToStr(cmd.y2),
        );
        break;
      case 'Z':
        tokens.push('z');
        break;
    }
  }
  return tokens.join(' ') + ' ';
}

function main() {
  const { in: inPath, out: outPath } = parseArgs(process.argv.slice(2));

  const buf = readFileSync(inPath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const font = opentype.parse(arrayBuffer);

  const codepoints = new Set([0x3f]); // '?' fallback glyph is mandatory
  for (const [start, end] of RANGES) {
    for (let cp = start; cp <= end; cp++) codepoints.add(cp);
  }

  const glyphs = {};
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  let included = 0, skipped = 0;

  for (const cp of codepoints) {
    const char = String.fromCodePoint(cp);
    if (char === '\n') continue; // FontLoader.js handles newlines itself, never looks it up
    const glyphIndex = font.charToGlyphIndex(char);
    if (glyphIndex === 0) { skipped++; continue; } // 0 = .notdef, i.e. font has no such glyph
    const glyph = font.glyphs.get(glyphIndex);

    const outline = char === ' ' ? '' : outlineToPathString(glyph.path);
    glyphs[char] = {
      ha: Math.round(glyph.advanceWidth),
      x_min: Math.round(glyph.xMin ?? 0),
      x_max: Math.round(glyph.xMax ?? 0),
      o: outline,
    };

    if (glyph.xMin !== undefined) xMin = Math.min(xMin, glyph.xMin);
    if (glyph.xMax !== undefined) xMax = Math.max(xMax, glyph.xMax);
    if (glyph.yMin !== undefined) yMin = Math.min(yMin, glyph.yMin);
    if (glyph.yMax !== undefined) yMax = Math.max(yMax, glyph.yMax);
    included++;
  }

  const post = font.tables.post ?? {};
  const typeface = {
    glyphs,
    familyName: font.names.fontFamily?.en ?? 'Vazirmatn',
    ascender: Math.round(font.ascender),
    descender: Math.round(font.descender),
    underlinePosition: Math.round(post.underlinePosition ?? -100),
    underlineThickness: Math.round(post.underlineThickness ?? 50),
    boundingBox: {
      xMin: Math.round(xMin), xMax: Math.round(xMax),
      yMin: Math.round(yMin), yMax: Math.round(yMax),
    },
    resolution: font.unitsPerEm,
    original_font_information: font.tables.name ?? {},
    cssFontWeight: 'normal',
    cssFontStyle: 'normal',
  };

  writeFileSync(outPath, JSON.stringify(typeface));
  console.log(`Wrote ${outPath}: ${included} glyphs included, ${skipped} codepoints skipped (not in font).`);
}

main();
