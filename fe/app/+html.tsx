import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Custom HTML template: ensures #root fills the full browser viewport width and
// uses column flex direction so React Native View children stack vertically.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
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
