import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import CopilotProvider from '../components/CopilotProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Structable Tree Table',
  description: 'Resizable grouped React tree table with multi-cell selection',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CopilotProvider>
          {children}
        </CopilotProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
