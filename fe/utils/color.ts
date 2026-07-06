const SIX_DIGIT_HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_DRAFT_RE = /^#[0-9a-fA-F]{0,6}$/;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function snapUnitEpsilon(value: number): number {
  if (Math.abs(value) < 1e-12) return 0;
  if (Math.abs(1 - value) < 1e-12) return 1;
  return value;
}

export function isSixDigitHexColor(value: string): boolean {
  return SIX_DIGIT_HEX_COLOR_RE.test(value);
}

export function isHexColorDraft(value: string): boolean {
  return HEX_COLOR_DRAFT_RE.test(value);
}

export function hexColorToRgbNumber(value: string): number | null {
  if (!isSixDigitHexColor(value)) return null;
  return parseInt(value.slice(1), 16);
}

export function rgbNumberToHexColor(value: number): string {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  const clamped = Math.max(0, Math.min(0xffffff, normalized));
  return `#${clamped.toString(16).padStart(6, '0')}`;
}

export function hslToRgbUnit(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const h = ((hue % 1) + 1) % 1;
  const s = clamp01(saturation);
  const l = clamp01(lightness);
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [snapUnitEpsilon(f(0)), snapUnitEpsilon(f(8)), snapUnitEpsilon(f(4))];
}
