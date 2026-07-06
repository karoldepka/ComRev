import { describe, expect, it } from 'vitest';

import {
  decodeBase64Bytes,
  decodeDataUrlArrayBuffer,
  decodeSvgDataUrl,
  encodeBase64Bytes,
  encodeSvgDataUrl,
  isSvgDataUrl,
  parseDataUrl,
} from '../data-url';

describe('data URL utilities', () => {
  it('parses media type, parameters, and base64 flag', () => {
    expect(
      parseDataUrl('data:image/svg+xml;charset=utf-8;base64,PHN2Zy8+'),
    ).toEqual({
      mediaType: 'image/svg+xml',
      parameters: ['charset=utf-8'],
      isBase64: true,
      data: 'PHN2Zy8+',
    });
  });

  it('round-trips SVG text with Unicode through a base64 data URL', () => {
    const svg = '<svg><text>Zażółć gęślą jaźń</text></svg>';
    const dataUrl = encodeSvgDataUrl(svg);

    expect(isSvgDataUrl(dataUrl)).toBe(true);
    expect(decodeSvgDataUrl(dataUrl)).toBe(svg);
  });

  it('decodes percent-encoded SVG data URLs', () => {
    const svg = '<svg><path fill="#ff6600"/></svg>';
    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;

    expect(decodeSvgDataUrl(dataUrl)).toBe(svg);
  });

  it('returns null for non-SVG data passed to SVG decoder', () => {
    expect(decodeSvgDataUrl('data:text/plain;base64,SGVsbG8=')).toBeNull();
  });

  it('round-trips arbitrary base64 bytes', () => {
    const bytes = new Uint8Array([0, 1, 65, 127, 128, 255]);
    const encoded = encodeBase64Bytes(bytes);

    expect(Array.from(decodeBase64Bytes(encoded))).toEqual(Array.from(bytes));
  });

  it('decodes data URLs as ArrayBuffer without leaking backing buffer offsets', () => {
    const buffer = decodeDataUrlArrayBuffer(
      'data:application/octet-stream;base64,AAFBf4D/',
    );

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(buffer!))).toEqual([
      0, 1, 65, 127, 128, 255,
    ]);
  });
});
