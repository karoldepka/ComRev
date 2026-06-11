#!/usr/bin/env node
const { mkdir, readFile, readdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

function parseArgs(argv) {
  const options = {
    inDir: './assets/structures',
    outDir: './assets/structures-trimmed',
    padding: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--inDir' && argv[index + 1]) {
      options.inDir = argv[index + 1];
      index += 1;
    } else if (item === '--outDir' && argv[index + 1]) {
      options.outDir = argv[index + 1];
      index += 1;
    } else if (item === '--padding' && argv[index + 1]) {
      options.padding = Number(argv[index + 1]);
      index += 1;
    }
  }

  if (!Number.isFinite(options.padding) || options.padding < 0) {
    throw new Error('--padding must be a non-negative number.');
  }

  return options;
}

function identity() {
  return [1, 0, 0, 1, 0, 0];
}

function multiply(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function applyMatrix(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function parseTransform(value) {
  if (!value) {
    return identity();
  }

  let matrix = identity();
  const transforms = value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g);

  for (const [, rawName, rawArgs] of transforms) {
    const name = rawName.toLowerCase();
    const args = parseNumbers(rawArgs);
    let next = identity();

    if (name === 'matrix' && args.length >= 6) {
      next = args.slice(0, 6);
    } else if (name === 'translate') {
      next = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
    } else if (name === 'scale') {
      const sx = args[0] ?? 1;
      const sy = args[1] ?? sx;
      next = [sx, 0, 0, sy, 0, 0];
    } else if (name === 'rotate') {
      const angle = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotate = [cos, sin, -sin, cos, 0, 0];
      if (args.length >= 3) {
        next = multiply(multiply([1, 0, 0, 1, args[1], args[2]], rotate), [1, 0, 0, 1, -args[1], -args[2]]);
      } else {
        next = rotate;
      }
    } else if (name === 'skewx') {
      next = [1, 0, Math.tan(((args[0] || 0) * Math.PI) / 180), 1, 0, 0];
    } else if (name === 'skewy') {
      next = [1, Math.tan(((args[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }

    matrix = multiply(matrix, next);
  }

  return matrix;
}

function parseAttrs(tag) {
  const attrs = {};
  const attrPattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const [, name, doubleQuoted, singleQuoted] of tag.matchAll(attrPattern)) {
    attrs[name] = doubleQuoted ?? singleQuoted ?? '';
  }
  return attrs;
}

function parseNumbers(value) {
  if (!value) {
    return [];
  }
  return Array.from(String(value).matchAll(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi), (match) => Number(match[0]));
}

function parseLength(value, fallback = 0) {
  const parsed = parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fontSizeFrom(attrs, inheritedFontSize) {
  if (attrs['font-size']) {
    return parseLength(attrs['font-size'], inheritedFontSize);
  }
  const styleFontSize = attrs.style?.match(/font-size\s*:\s*([0-9.]+)/i)?.[1];
  if (styleFontSize) {
    return parseLength(styleFontSize, inheritedFontSize);
  }
  const styleFont = attrs.style?.match(/font\s*:[^;]*\s([0-9.]+)px/i)?.[1];
  if (styleFont) {
    return parseLength(styleFont, inheritedFontSize);
  }
  return inheritedFontSize;
}

function emptyBounds() {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function addPoint(bounds, matrix, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  const point = applyMatrix(matrix, x, y);
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function addRect(bounds, matrix, x, y, width, height) {
  addPoint(bounds, matrix, x, y);
  addPoint(bounds, matrix, x + width, y);
  addPoint(bounds, matrix, x + width, y + height);
  addPoint(bounds, matrix, x, y + height);
}

function addPathBounds(bounds, matrix, d) {
  const tokens = Array.from(String(d).matchAll(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi), (match) => match[0]);
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;

  const isCommand = (token) => /^[a-zA-Z]$/.test(token);
  const readNumber = () => Number(tokens[index++]);
  const hasNumber = () => index < tokens.length && !isCommand(tokens[index]);
  const add = (nextX, nextY) => {
    x = nextX;
    y = nextY;
    addPoint(bounds, matrix, x, y);
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++];
    }
    if (!command) {
      break;
    }

    const relative = command === command.toLowerCase();
    const op = command.toUpperCase();

    if (op === 'Z') {
      add(startX, startY);
      command = '';
      continue;
    }

    if (op === 'M') {
      while (hasNumber()) {
        const nextX = readNumber();
        const nextY = readNumber();
        add(relative ? x + nextX : nextX, relative ? y + nextY : nextY);
        startX = x;
        startY = y;
        command = relative ? 'l' : 'L';
      }
      continue;
    }

    if (op === 'L') {
      while (hasNumber()) {
        const nextX = readNumber();
        const nextY = readNumber();
        add(relative ? x + nextX : nextX, relative ? y + nextY : nextY);
      }
      continue;
    }

    if (op === 'H') {
      while (hasNumber()) {
        const nextX = readNumber();
        add(relative ? x + nextX : nextX, y);
      }
      continue;
    }

    if (op === 'V') {
      while (hasNumber()) {
        const nextY = readNumber();
        add(x, relative ? y + nextY : nextY);
      }
      continue;
    }

    if (op === 'C') {
      while (hasNumber()) {
        for (let point = 0; point < 3; point += 1) {
          const nextX = readNumber();
          const nextY = readNumber();
          addPoint(bounds, matrix, relative ? x + nextX : nextX, relative ? y + nextY : nextY);
          if (point === 2) {
            x = relative ? x + nextX : nextX;
            y = relative ? y + nextY : nextY;
          }
        }
      }
      continue;
    }

    if (op === 'S' || op === 'Q') {
      while (hasNumber()) {
        const pairs = op === 'S' ? 2 : 2;
        for (let point = 0; point < pairs; point += 1) {
          const nextX = readNumber();
          const nextY = readNumber();
          addPoint(bounds, matrix, relative ? x + nextX : nextX, relative ? y + nextY : nextY);
          if (point === pairs - 1) {
            x = relative ? x + nextX : nextX;
            y = relative ? y + nextY : nextY;
          }
        }
      }
      continue;
    }

    if (op === 'T') {
      while (hasNumber()) {
        const nextX = readNumber();
        const nextY = readNumber();
        add(relative ? x + nextX : nextX, relative ? y + nextY : nextY);
      }
      continue;
    }

    if (op === 'A') {
      while (hasNumber()) {
        const rx = readNumber();
        const ry = readNumber();
        readNumber();
        readNumber();
        readNumber();
        const nextX = readNumber();
        const nextY = readNumber();
        const endX = relative ? x + nextX : nextX;
        const endY = relative ? y + nextY : nextY;
        addRect(bounds, matrix, Math.min(x, endX) - rx, Math.min(y, endY) - ry, Math.abs(endX - x) + rx * 2, Math.abs(endY - y) + ry * 2);
        x = endX;
        y = endY;
      }
      continue;
    }

    break;
  }
}

function addTextBounds(bounds, state, text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return;
  }

  const x = parseLength(state.attrs.x, 0);
  const y = parseLength(state.attrs.y, 0);
  const fontSize = state.fontSize || 16;
  const width = normalized.length * fontSize * 0.62;
  const height = fontSize;
  addRect(bounds, state.matrix, x, y - fontSize * 0.8, width, height);
}

function isVisible(attrs) {
  const style = attrs.style || '';
  return attrs.display !== 'none' && attrs.visibility !== 'hidden' && !/display\s*:\s*none/i.test(style) && !/visibility\s*:\s*hidden/i.test(style);
}

function calculateBounds(svg) {
  const bounds = emptyBounds();
  const stack = [{ name: '#document', matrix: identity(), fontSize: 16, attrs: {} }];
  const ignoredContainers = new Set(['defs', 'clippath', 'mask', 'pattern', 'symbol', 'metadata', 'title', 'desc', 'style', 'script', 'sodipodi:namedview']);
  let ignoredDepth = 0;

  const parts = svg.match(/<[^>]+>|[^<]+/g) || [];
  for (const part of parts) {
    if (!part.startsWith('<')) {
      const state = stack[stack.length - 1];
      if (ignoredDepth === 0 && (state.name === 'text' || state.name === 'tspan')) {
        addTextBounds(bounds, state, part);
      }
      continue;
    }

    if (/^<\?/.test(part) || /^<!/.test(part)) {
      continue;
    }

    const closeMatch = part.match(/^<\/\s*([:\w-]+)/);
    if (closeMatch) {
      const name = closeMatch[1].toLowerCase();
      if (ignoredDepth > 0) {
        ignoredDepth -= 1;
      }
      while (stack.length > 1) {
        const popped = stack.pop();
        if (popped.name === name) {
          break;
        }
      }
      continue;
    }

    const openMatch = part.match(/^<\s*([:\w-]+)/);
    if (!openMatch) {
      continue;
    }

    const name = openMatch[1].toLowerCase();
    const attrs = parseAttrs(part);
    const parent = stack[stack.length - 1];
    const ownMatrix = parseTransform(attrs.transform);
    const state = {
      name,
      attrs,
      matrix: multiply(parent.matrix, ownMatrix),
      fontSize: fontSizeFrom(attrs, parent.fontSize),
    };
    const selfClosing = /\/\s*>$/.test(part);
    const ignoreThis = ignoredContainers.has(name);

    if (ignoredDepth === 0 && !ignoreThis && isVisible(attrs)) {
      if (name === 'path' && attrs.d) {
        addPathBounds(bounds, state.matrix, attrs.d);
      } else if (name === 'polygon' || name === 'polyline') {
        const numbers = parseNumbers(attrs.points);
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          addPoint(bounds, state.matrix, numbers[index], numbers[index + 1]);
        }
      } else if (name === 'rect') {
        addRect(bounds, state.matrix, parseLength(attrs.x), parseLength(attrs.y), parseLength(attrs.width), parseLength(attrs.height));
      } else if (name === 'line') {
        addPoint(bounds, state.matrix, parseLength(attrs.x1), parseLength(attrs.y1));
        addPoint(bounds, state.matrix, parseLength(attrs.x2), parseLength(attrs.y2));
      } else if (name === 'circle') {
        const cx = parseLength(attrs.cx);
        const cy = parseLength(attrs.cy);
        const r = parseLength(attrs.r);
        addRect(bounds, state.matrix, cx - r, cy - r, r * 2, r * 2);
      } else if (name === 'ellipse') {
        const cx = parseLength(attrs.cx);
        const cy = parseLength(attrs.cy);
        const rx = parseLength(attrs.rx);
        const ry = parseLength(attrs.ry);
        addRect(bounds, state.matrix, cx - rx, cy - ry, rx * 2, ry * 2);
      }
    }

    if (ignoreThis) {
      ignoredDepth += 1;
    }

    if (!selfClosing) {
      stack.push(state);
    } else if (ignoreThis) {
      ignoredDepth -= 1;
    }
  }

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
    return null;
  }

  return bounds;
}

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function setSvgAttr(svgTag, attr, value) {
  const pattern = new RegExp(`\\s${attr}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'i');
  if (pattern.test(svgTag)) {
    return svgTag.replace(pattern, ` ${attr}="${value}"`);
  }
  return svgTag.replace(/>$/, ` ${attr}="${value}">`);
}

function updateRootSvg(svg, bounds, padding) {
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const viewBox = [minX, minY, width, height].map(formatNumber).join(' ');

  return svg.replace(/<svg\b[^>]*>/i, (tag) => {
    let next = tag;
    next = setSvgAttr(next, 'viewBox', viewBox);
    next = setSvgAttr(next, 'width', formatNumber(width));
    next = setSvgAttr(next, 'height', formatNumber(height));
    return next;
  });
}

async function trimFile(sourcePath, targetPath, padding) {
  const svg = await readFile(sourcePath, 'utf8');
  const bounds = calculateBounds(svg);
  if (!bounds) {
    throw new Error('No visible SVG bounds found.');
  }

  const cropped = updateRootSvg(svg, bounds, padding);
  await writeFile(targetPath, cropped);

  return {
    width: bounds.maxX - bounds.minX + padding * 2,
    height: bounds.maxY - bounds.minY + padding * 2,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceDir = path.resolve(options.inDir);
  const targetDir = path.resolve(options.outDir);

  if (sourceDir === targetDir) {
    throw new Error('Input and output directories must be different so originals stay untouched.');
  }

  await mkdir(targetDir, { recursive: true });
  const files = (await readdir(sourceDir)).filter((file) => file.toLowerCase().endsWith('.svg')).sort();
  if (files.length === 0) {
    throw new Error(`No SVG files found in ${sourceDir}`);
  }

  let completed = 0;
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    try {
      const result = await trimFile(sourcePath, targetPath, options.padding);
      completed += 1;
      console.log(`Trimmed ${file} -> ${path.relative(process.cwd(), targetPath)} (${formatNumber(result.width)} x ${formatNumber(result.height)})`);
    } catch (error) {
      console.error(`Failed to trim ${file}: ${error.message || error}`);
    }
  }

  console.log(`Done. Wrote ${completed}/${files.length} SVGs to ${targetDir}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
