import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './utils/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        app: '5px',
      },
      colors: {
        app: {
          bg: 'var(--app-bg)',
          fg: 'var(--app-fg)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
          surface: 'var(--surface)',
          raised: 'var(--surface-raised)',
          soft: 'var(--surface-soft)',
          border: 'var(--border)',
          'border-strong': 'var(--border-strong)',
          primary: 'var(--color-primary)',
          secondary: 'var(--color-secondary)',
          danger: 'var(--danger)',
        },
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        popover: 'var(--shadow-popover)',
        sticky: 'var(--shadow-sticky)',
      },
    },
  },
  plugins: [],
};

export default config;
