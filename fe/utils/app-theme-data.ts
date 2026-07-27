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
  | 'system'
  | 'sunrise'
  | 'yellow'
  | 'lavender'
  | 'sea-glass'
  | 'rose-paper'
  | 'midnight'
  | 'forest'
  | 'indigo-dusk'
  | 'ember'
  | 'deep-ocean';

export type AppTheme = {
  id: Exclude<AppThemeId, 'system'>;
  name: string;
  description: string;
  colorScheme: ColorScheme;
  colors: ThemeColors;
};

export const APP_THEME_IDS = [
  'system',
  'sunrise',
  'yellow',
  'lavender',
  'sea-glass',
  'rose-paper',
  'midnight',
  'forest',
  'indigo-dusk',
  'ember',
  'deep-ocean',
] as const satisfies readonly AppThemeId[];

export function isAppThemeId(value: string | null): value is AppThemeId {
  return APP_THEME_IDS.some((themeId) => themeId === value);
}

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
  'sea-glass': {
    id: 'sea-glass',
    name: 'Sea glass',
    description: 'Cool blue paper with crisp ocean accents.',
    colorScheme: 'light',
    colors: {
      text: '#073b4c',
      background: '#eaf8ff',
      tint: '#0077b6',
      icon: '#568096',
      tabIconDefault: '#568096',
      tabIconSelected: '#0077b6',
      surface: '#ffffff',
      surfaceRaised: '#dcf4ff',
      border: '#b9dfef',
      subtleBackground: '#dff5ff',
      subtleBorder: '#a9d8ee',
      onTint: '#ffffff',
    },
  },
  'rose-paper': {
    id: 'rose-paper',
    name: 'Rose paper',
    description: 'Soft rose surfaces and confident berry controls.',
    colorScheme: 'light',
    colors: {
      text: '#3d1323',
      background: '#fff4f6',
      tint: '#bd3d69',
      icon: '#8b6070',
      tabIconDefault: '#8b6070',
      tabIconSelected: '#bd3d69',
      surface: '#ffffff',
      surfaceRaised: '#ffe8ee',
      border: '#efc9d6',
      subtleBackground: '#ffebf1',
      subtleBorder: '#eeb7c9',
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
  'indigo-dusk': {
    id: 'indigo-dusk',
    name: 'Indigo dusk',
    description: 'Blue-violet night with luminous periwinkle accents.',
    colorScheme: 'dark',
    colors: {
      text: '#f1f0ff',
      background: '#17182f',
      tint: '#aaa7ff',
      icon: '#afb0d0',
      tabIconDefault: '#afb0d0',
      tabIconSelected: '#aaa7ff',
      surface: '#222342',
      surfaceRaised: '#2b2d50',
      border: '#3c3e68',
      subtleBackground: '#27284b',
      subtleBorder: '#4b4d82',
      onTint: '#17172e',
    },
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    description: 'Charcoal warmth with glowing coral actions.',
    colorScheme: 'dark',
    colors: {
      text: '#fff2ed',
      background: '#251713',
      tint: '#ff765a',
      icon: '#c9aaa2',
      tabIconDefault: '#c9aaa2',
      tabIconSelected: '#ff9279',
      surface: '#35201a',
      surfaceRaised: '#442720',
      border: '#5d3a31',
      subtleBackground: '#3a211b',
      subtleBorder: '#704236',
      onTint: '#35130c',
    },
  },
  'deep-ocean': {
    id: 'deep-ocean',
    name: 'Deep ocean',
    description: 'Inky blue depth with clear cyan navigation.',
    colorScheme: 'dark',
    colors: {
      text: '#e8f7ff',
      background: '#081e2d',
      tint: '#4dc9f6',
      icon: '#9cbccb',
      tabIconDefault: '#9cbccb',
      tabIconSelected: '#71d7fa',
      surface: '#102c3d',
      surfaceRaised: '#17394d',
      border: '#2d5267',
      subtleBackground: '#123547',
      subtleBorder: '#376c84',
      onTint: '#06212d',
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
