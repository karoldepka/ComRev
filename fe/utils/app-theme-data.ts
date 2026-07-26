export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  subtleBackground: string;
  subtleBorder: string;
  onTint: string;
};

export type AppThemeId =
  'system' | 'sunrise' | 'yellow' | 'lavender' | 'midnight' | 'forest';

export type AppTheme = {
  id: Exclude<AppThemeId, 'system'>;
  name: string;
  description: string;
  colorScheme: ColorScheme;
  colors: ThemeColors;
};

const orange = '#f97316';

export const APP_THEMES: Record<Exclude<AppThemeId, 'system'>, AppTheme> = {
  sunrise: {
    id: 'sunrise',
    name: 'Sunrise',
    description: 'Warm paper and the Structable orange.',
    colorScheme: 'light',
    colors: {
      text: '#2a180d',
      background: '#fffaf4',
      tint: orange,
      icon: '#826b5d',
      tabIconDefault: '#826b5d',
      tabIconSelected: orange,
      surface: '#ffffff',
      surfaceRaised: '#fff4e8',
      border: '#f2d9c4',
      subtleBackground: '#fff1e3',
      subtleBorder: '#ffd2a8',
      onTint: '#ffffff',
    },
  },
  yellow: {
    id: 'yellow',
    name: 'Yellow notebook',
    description: 'Bright yellow canvas with ink-blue accents.',
    colorScheme: 'light',
    colors: {
      text: '#29230a',
      background: '#fff3a6',
      tint: '#2543a5',
      icon: '#766c34',
      tabIconDefault: '#766c34',
      tabIconSelected: '#2543a5',
      surface: '#fffbe0',
      surfaceRaised: '#fff8bf',
      border: '#ded076',
      subtleBackground: '#fff8c8',
      subtleBorder: '#d8c763',
      onTint: '#ffffff',
    },
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    description: 'A calm, bright violet workspace.',
    colorScheme: 'light',
    colors: {
      text: '#261d3a',
      background: '#f7f1ff',
      tint: '#7451bd',
      icon: '#786d91',
      tabIconDefault: '#786d91',
      tabIconSelected: '#7451bd',
      surface: '#ffffff',
      surfaceRaised: '#f0e8ff',
      border: '#d9cbed',
      subtleBackground: '#eee4ff',
      subtleBorder: '#cdb8ec',
      onTint: '#ffffff',
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Low-glare graphite with orange highlights.',
    colorScheme: 'dark',
    colors: {
      text: '#f5f0eb',
      background: '#16181d',
      tint: '#ff9c42',
      icon: '#aaaeb8',
      tabIconDefault: '#aaaeb8',
      tabIconSelected: '#ff9c42',
      surface: '#20232a',
      surfaceRaised: '#292d35',
      border: '#363b45',
      subtleBackground: '#2a211b',
      subtleBorder: '#5c412b',
      onTint: '#211100',
    },
  },
  forest: {
    id: 'forest',
    name: 'Night forest',
    description: 'Deep green surfaces with fresh mint accents.',
    colorScheme: 'dark',
    colors: {
      text: '#edf7ef',
      background: '#10221c',
      tint: '#77d6a5',
      icon: '#9db6aa',
      tabIconDefault: '#9db6aa',
      tabIconSelected: '#77d6a5',
      surface: '#173129',
      surfaceRaised: '#1e3d33',
      border: '#315348',
      subtleBackground: '#1b3b30',
      subtleBorder: '#356451',
      onTint: '#092117',
    },
  },
};

export const DEFAULT_THEME_ID: AppThemeId = 'system';

export function resolveAppTheme(
  themeId: AppThemeId,
  systemColorScheme: ColorScheme,
): AppTheme {
  return themeId === 'system'
    ? APP_THEMES[systemColorScheme === 'dark' ? 'midnight' : 'sunrise']
    : APP_THEMES[themeId];
}
