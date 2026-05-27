import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import NavBar from '../components/NavBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Structable Tree Table',
  description: 'Resizable grouped React tree table with multi-cell selection',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <NavBar />
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
