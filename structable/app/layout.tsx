import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Structable Tree Table',
  description: 'Resizable grouped React tree table with multi-cell selection',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
