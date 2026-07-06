import { describe, expect, it } from 'vitest';

import {
  hexColorToRgbNumber,
  hslToRgbUnit,
  isHexColorDraft,
  isSixDigitHexColor,
  rgbNumberToHexColor,
} from '../color';

describe('color utilities', () => {
  it('formats RGB numbers as padded six-digit hex colors', () => {
    expect(rgbNumberToHexColor(0)).toBe('#000000');
    expect(rgbNumberToHexColor(0xff6600)).toBe('#ff6600');
    expect(rgbNumberToHexColor(0xabc)).toBe('#000abc');
  });

  it('clamps invalid RGB numbers into browser-safe hex colors', () => {
    expect(rgbNumberToHexColor(-1)).toBe('#000000');
    expect(rgbNumberToHexColor(0x1234567)).toBe('#ffffff');
    expect(rgbNumberToHexColor(Number.NaN)).toBe('#000000');
  });

  it('parses only full #rrggbb colors', () => {
    expect(hexColorToRgbNumber('#ff6600')).toBe(0xff6600);
    expect(hexColorToRgbNumber('#FF6600')).toBe(0xff6600);
    expect(hexColorToRgbNumber('#abc')).toBeNull();
    expect(hexColorToRgbNumber('ff6600')).toBeNull();
  });

  it('distinguishes editable hex drafts from complete colors', () => {
    expect(isHexColorDraft('#')).toBe(true);
    expect(isHexColorDraft('#ff66')).toBe(true);
    expect(isSixDigitHexColor('#ff6600')).toBe(true);
    expect(isHexColorDraft('#ff66000')).toBe(false);
    expect(isSixDigitHexColor('#ff66')).toBe(false);
  });

  it('converts HSL to normalized RGB channels', () => {
    expect(hslToRgbUnit(0, 1, 0.5)).toEqual([1, 0, 0]);
    expect(hslToRgbUnit(1 / 3, 1, 0.5)).toEqual([0, 1, 0]);
    expect(hslToRgbUnit(2 / 3, 1, 0.5)).toEqual([0, 0, 1]);
    expect(hslToRgbUnit(0.5, 0, 0.25)).toEqual([0.25, 0.25, 0.25]);
  });

  it('wraps hue and clamps saturation/lightness', () => {
    expect(hslToRgbUnit(1, 1, 0.5)).toEqual(hslToRgbUnit(0, 1, 0.5));
    expect(hslToRgbUnit(-1 / 3, 1, 0.5)).toEqual([0, 0, 1]);
    expect(hslToRgbUnit(0, 2, 2)).toEqual([1, 1, 1]);
  });
});
