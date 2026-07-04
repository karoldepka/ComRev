import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const APP_NAME = 'ComRev';
const MANIFEST_HREF = '/manifest.json';
const THEME_COLOR = '#f97316';
const APPLE_TOUCH_ICON_HREF = '/icons/icon-192.png';

// Custom HTML template: ensures #root fills the full browser viewport width and
// uses column flex direction so React Native View children stack vertically.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="manifest" href={MANIFEST_HREF} />
        <meta name="theme-color" content={THEME_COLOR} />
        <link rel="apple-touch-icon" href={APPLE_TOUCH_ICON_HREF} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body, #root {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
            }
            body { overflow: hidden; }
            #root {
              display: flex;
              flex-direction: column;
            }
          `,
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
