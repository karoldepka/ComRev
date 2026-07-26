import { describe, expect, it } from 'vitest';

import { APP_THEMES, resolveAppTheme } from '../app-theme-data';

describe('resolveAppTheme', () => {
  it('uses the matching default palette for the system color scheme', () => {
    expect(resolveAppTheme('system', 'light')).toBe(APP_THEMES.sunrise);
    expect(resolveAppTheme('system', 'dark')).toBe(APP_THEMES.midnight);
  });

  it('keeps an explicit theme regardless of system color scheme', () => {
    expect(resolveAppTheme('yellow', 'dark')).toBe(APP_THEMES.yellow);
    expect(resolveAppTheme('forest', 'light')).toBe(APP_THEMES.forest);
  });

  it('defines readable foreground colors for every palette', () => {
    for (const theme of Object.values(APP_THEMES)) {
      expect(theme.colors.text).not.toBe(theme.colors.background);
      expect(theme.colors.onTint).not.toBe(theme.colors.tint);
    }
  });
});
