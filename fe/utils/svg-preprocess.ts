/**
 * SVG pre-processing pipeline run at import time (file pick, icon pick, or any future
 * source of external SVGs).
 *
 *  Font vectorisation – converts <text> / <tspan> elements that use embedded
 *  @font-face fonts to <path> elements so the SVG is self-contained.
 *  (System-named fonts that have no embedded data are left as-is; they still
 *  render correctly in the browser but won't be truly portable.)
 */

import { Font, parse } from 'opentype.js';
import {
  decodeDataUrlArrayBuffer,
  decodeSvgDataUrl,
  encodeSvgDataUrl,
} from './data-url';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Walk up the DOM tree to find the nearest ancestor value for a presentation attr. */
function inheritedAttr(el: Element, attr: string): string | null {
  let node: Element | null = el;
  while (node) {
    const val = node.getAttribute(attr);
    if (val) return val;
    node = node.parentElement;
  }
  return null;
}

// ── Stage 1: Font vectorisation ───────────────────────────────────────────────

/** Load all @font-face fonts embedded as base64 data URIs inside a parsed SVG document. */
async function loadEmbeddedFonts(doc: Document): Promise<Map<string, Font>> {
  const fonts = new Map<string, Font>();

  // Collect CSS from all <style> elements
  const css = Array.from(doc.querySelectorAll('style'))
    .map(s => s.textContent ?? '')
    .join('\n');

  const faceRe = /@font-face\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = faceRe.exec(css)) !== null) {
    const block = m[1];
    const familyM = block.match(/font-family\s*:\s*['"]?([^'";,}\n]+)['"]?/);
    const srcM = block.match(/src\s*:\s*([^;]+)/);
    if (!familyM || !srcM) continue;

    const family = familyM[1].trim().toLowerCase().replace(/^['"]|['"]$/g, '');
    const src = srcM[1];
    const dataM = src.match(/url\(['"]?(data:[^'")\s]+)['"]?\)/);
    if (!dataM) continue;

    const buf = decodeDataUrlArrayBuffer(dataM[1]);
    if (!buf) continue;
    try {
      const font = parse(buf);
      fonts.set(family, font);
    } catch {
      // corrupt/unsupported font – skip
    }
  }
  return fonts;
}

/**
 * Text elements can have their content spread across <tspan> children.
 * Collect all leaf text runs with their effective x/y.
 */
interface TextRun {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  presentationAttrs: Record<string, string>;
}

function collectTextRuns(textEl: Element, defaultFontSize: number): TextRun[] {
  const runs: TextRun[] = [];
  const baseX = parseFloat(textEl.getAttribute('x') ?? '0');
  const baseY = parseFloat(textEl.getAttribute('y') ?? '0');
  const baseFontSize = parseFloat(
    textEl.getAttribute('font-size') ?? inheritedAttr(textEl, 'font-size') ?? String(defaultFontSize),
  );
  const baseFontFamily = (
    textEl.getAttribute('font-family') ?? inheritedAttr(textEl, 'font-family') ?? 'sans-serif'
  ).toLowerCase().trim().replace(/^['"]|['"]$/g, '');

  // Presentation attributes to copy to the resulting <path>
  const COPY_ATTRS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'transform', 'style'];

  const captureAttrs = (el: Element): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const a of COPY_ATTRS) {
      const v = el.getAttribute(a);
      if (v) out[a] = v;
    }
    return out;
  };

  const tspans = textEl.querySelectorAll('tspan');
  if (tspans.length === 0) {
    // Simple text node
    const text = textEl.textContent?.trim() ?? '';
    if (text) {
      runs.push({ text, x: baseX, y: baseY, fontSize: baseFontSize, fontFamily: baseFontFamily, presentationAttrs: captureAttrs(textEl) });
    }
  } else {
    let cursorX = baseX;
    for (const tspan of Array.from(tspans)) {
      const text = tspan.textContent?.trim() ?? '';
      if (!text) continue;
      const x = parseFloat(tspan.getAttribute('x') ?? String(cursorX));
      const y = parseFloat(tspan.getAttribute('y') ?? String(baseY));
      const fontSize = parseFloat(tspan.getAttribute('font-size') ?? String(baseFontSize));
      const fontFamily = (
        tspan.getAttribute('font-family') ?? baseFontFamily
      ).toLowerCase().trim().replace(/^['"]|['"]$/g, '');
      const attrs = { ...captureAttrs(textEl), ...captureAttrs(tspan) };
      runs.push({ text, x, y, fontSize, fontFamily, presentationAttrs: attrs });
      // Advance cursor (rough estimate; a full layout engine would be needed for accuracy)
      cursorX = x;
    }
  }
  return runs;
}

async function vectorizeSvgFonts(svgText: string): Promise<string> {
  if (typeof DOMParser === 'undefined') return svgText;
  if (!svgText.includes('<text') && !svgText.includes('<tspan')) return svgText;

  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(svgText, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svgText;
  } catch {
    return svgText;
  }

  const fonts = await loadEmbeddedFonts(doc);
  if (fonts.size === 0) return svgText; // No embedded fonts we can use

  const textElements = Array.from(doc.querySelectorAll('text'));
  let changed = false;

  for (const textEl of textElements) {
    const runs = collectTextRuns(textEl, 16);
    const pathEls: Element[] = [];

    for (const run of runs) {
      const font = fonts.get(run.fontFamily) ?? fonts.get('') ?? undefined;
      if (!font) continue;
      try {
        const otPath = font.getPath(run.text, run.x, run.y, run.fontSize);
        const svgPath = otPath.toSVG(4); // 4 decimal digits – lossless for typical sizes
        const dMatch = svgPath.match(/d="([^"]+)"/);
        if (!dMatch) continue;

        const pathEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', dMatch[1]);
        for (const [k, v] of Object.entries(run.presentationAttrs)) {
          pathEl.setAttribute(k, v);
        }
        pathEls.push(pathEl);
      } catch {
        // Font couldn't render this text – leave text element in place
        pathEls.length = 0;
        break;
      }
    }

    if (pathEls.length > 0) {
      const parent = textEl.parentNode;
      if (parent) {
        for (const p of pathEls) parent.insertBefore(p, textEl);
        parent.removeChild(textEl);
        changed = true;
      }
    }
  }

  if (!changed) return svgText;

  try {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
  } catch {
    return svgText;
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run the SVG pre-processing pipeline on raw SVG text:
 *   1. Vectorise embedded fonts (text → paths)
 *
 * Safe to call in browser.  Falls back to the original text on any error.
 */
export async function preprocessSvg(svgText: string): Promise<string> {
  try {
    return await vectorizeSvgFonts(svgText);
  } catch {
    return svgText;
  }
}

/**
 * Wrap the pipeline to work on SVG data URLs (base64 or percent-encoded).
 * Returns a new `data:image/svg+xml;base64,…` URL.
 */
export async function preprocessSvgDataUrl(dataUrl: string): Promise<string> {
  const svgText = decodeSvgDataUrl(dataUrl);
  if (!svgText) return dataUrl;
  try {
    const optimized = await preprocessSvg(svgText);
    return encodeSvgDataUrl(optimized);
  } catch {
    return dataUrl;
  }
}
