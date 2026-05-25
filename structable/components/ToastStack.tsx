'use client';

import { createPortal } from 'react-dom';
import type { ToastMessage } from '../types/table';

type Props = {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
};

const BG: Record<ToastMessage['level'], string> = {
  error: '#dc2626',
  warn:  '#d97706',
  info:  '#2563eb',
};

export default function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0 || typeof document === 'undefined') return null;
  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            padding: '10px 14px',
            borderRadius: 8,
            background: BG[t.level],
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: '0.855rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            maxWidth: 380,
            lineHeight: 1.4,
          }}
        >
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 0,
              fontSize: '1.1rem',
              lineHeight: 1,
              opacity: 0.75,
              flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
