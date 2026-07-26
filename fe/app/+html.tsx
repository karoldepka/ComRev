import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { APP_THEMES } from '@/utils/app-theme-data';

const APP_NAME = 'ComRev';
const MANIFEST_HREF = '/manifest.json';
const THEME_COLOR = '#f97316';
const APPLE_TOUCH_ICON_HREF = '/icons/icon-192.png';
const THEME_BOOTSTRAP_DATA = JSON.stringify(
  Object.fromEntries(
    Object.values(APP_THEMES).map((theme) => [
      theme.id,
      { background: theme.colors.background, colorScheme: theme.colorScheme },
    ]),
  ),
);
const THEME_BOOTSTRAP_SCRIPT = `
  try {
    const selectedTheme = localStorage.getItem('comrev.app-theme');
    const themes = ${THEME_BOOTSTRAP_DATA};
    const theme = themes[selectedTheme] || themes.sunrise;
    const colorScheme = selectedTheme === 'system' ? 'light dark' : theme.colorScheme;
    const background = theme.background;
    document.documentElement.dataset.appTheme = selectedTheme || 'system';
    document.documentElement.style.colorScheme = colorScheme;
    document.documentElement.style.backgroundColor = background;
    document.documentElement.style.setProperty('--app-background', background);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', colorScheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  } catch (_) {}
`;

// Custom HTML template: ensures #root fills the full browser viewport width and
// uses column flex direction so React Native View children stack vertically.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <link rel="manifest" href={MANIFEST_HREF} />
        <meta name="theme-color" content={THEME_COLOR} />
        <meta name="color-scheme" content="light dark" />
        <link rel="apple-touch-icon" href={APPLE_TOUCH_ICON_HREF} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            html, body, #root {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
            }
            html { background: var(--app-background, #fffaf4); color-scheme: light dark; }
            body { background: var(--app-background, #fffaf4); overflow: hidden; }
            #root {
              display: flex;
              flex-direction: column;
            }
          `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
