import { describe, expect, it } from 'vitest';

import {
  APP_THEME_IDS,
  APP_THEMES,
  isAppThemeId,
  resolveAppTheme,
} from '../app-theme-data';

function relativeLuminance(hex: string) {
  const [red, green, blue] = hex
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('resolveAppTheme', () => {
  it('uses the matching default palette for the system color scheme', () => {
    expect(resolveAppTheme('system', 'light')).toBe(APP_THEMES.sunrise);
    expect(resolveAppTheme('system', 'dark')).toBe(APP_THEMES.midnight);
  });

  it('keeps an explicit theme regardless of system color scheme', () => {
    expect(resolveAppTheme('yellow', 'dark')).toBe(APP_THEMES.yellow);
    expect(resolveAppTheme('forest', 'light')).toBe(APP_THEMES.forest);
    expect(resolveAppTheme('deep-ocean', 'light')).toBe(
      APP_THEMES['deep-ocean'],
    );
  });

  it('defines readable foreground colors for every palette', () => {
    for (const theme of Object.values(APP_THEMES)) {
      expect(
        contrastRatio(theme.colors.text, theme.colors.background),
        `${theme.name} needs readable body text`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.colors.onTint, theme.colors.tint),
        `${theme.name} needs readable accent labels`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the theme picker ids and palette catalog in sync', () => {
    const themeIds = Object.keys(APP_THEMES).sort();

    expect(themeIds).toHaveLength(30);
    expect(themeIds).toEqual(
      APP_THEME_IDS.filter((themeId) => themeId !== 'system').sort(),
    );
    for (const themeId of themeIds) {
      expect(APP_THEMES[themeId as keyof typeof APP_THEMES].id).toBe(themeId);
    }
  });

  it('accepts only supported persisted theme ids', () => {
    expect(isAppThemeId('yellow')).toBe(true);
    expect(isAppThemeId('midnight')).toBe(true);
    expect(isAppThemeId('sea-glass')).toBe(true);
    expect(isAppThemeId('indigo-dusk')).toBe(true);
    expect(isAppThemeId('retro-neon')).toBe(false);
    expect(isAppThemeId(null)).toBe(false);
  });
});
