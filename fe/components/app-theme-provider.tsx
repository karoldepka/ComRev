import { DefaultTheme, DarkTheme, type Theme } from '@react-navigation/native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_THEME_ID,
  isAppThemeId,
  type AppTheme,
  type AppThemeId,
  type ThemeColors,
  resolveAppTheme,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const THEME_STORAGE_KEY = 'comrev.app-theme';

type AppThemeContextValue = {
  selectedThemeId: AppThemeId;
  theme: AppTheme;
  colors: ThemeColors;
  colorScheme: 'light' | 'dark';
  navigationTheme: Theme;
  setTheme: (themeId: AppThemeId) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function getStoredThemeId(): AppThemeId {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_ID;
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isAppThemeId(value) ? value : DEFAULT_THEME_ID;
  } catch (error) {
    console.warn('Unable to read app theme preference:', error);
    return DEFAULT_THEME_ID;
  }
}

function persistThemeId(themeId: AppThemeId) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch (error) {
    console.warn('Unable to persist app theme preference:', error);
  }
}

function makeNavigationTheme(theme: AppTheme): Theme {
  const base = theme.colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.tint,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.tint,
    },
  };
}

function applyBrowserTheme(theme: AppTheme, selectedThemeId: AppThemeId) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.appTheme = selectedThemeId;
  root.style.colorScheme = theme.colorScheme;
  root.style.backgroundColor = theme.colors.background;
  root.style.setProperty('--app-background', theme.colors.background);
  root.style.setProperty('--app-text', theme.colors.text);
  root.style.setProperty('--app-tint', theme.colors.tint);

  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', theme.colorScheme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.colors.background);
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme() ?? 'light';
  // Initialize to the default theme (matching the statically-exported HTML,
  // which has no localStorage access) and sync the real stored value in an
  // effect. Reading localStorage during the initial render would make the
  // client's first hydration pass diverge from the server-rendered markup
  // whenever a non-default theme is persisted, triggering a React hydration
  // error.
  const [selectedThemeId, setSelectedThemeId] =
    useState<AppThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    setSelectedThemeId(getStoredThemeId());
  }, []);

  const theme = useMemo(
    () => resolveAppTheme(selectedThemeId, systemColorScheme),
    [selectedThemeId, systemColorScheme],
  );
  const setTheme = useCallback((themeId: AppThemeId) => {
    setSelectedThemeId(themeId);
    persistThemeId(themeId);
  }, []);
  const navigationTheme = useMemo(() => makeNavigationTheme(theme), [theme]);

  useEffect(() => {
    applyBrowserTheme(theme, selectedThemeId);
  }, [selectedThemeId, theme]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      selectedThemeId,
      theme,
      colors: theme.colors,
      colorScheme: theme.colorScheme,
      navigationTheme,
      setTheme,
    }),
    [navigationTheme, selectedThemeId, setTheme, theme],
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used inside AppThemeProvider.');
  }
  return value;
}
