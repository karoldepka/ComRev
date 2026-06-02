'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const REQUIRED = 'NUKE__ALL_DB';

type Props = {
  onConfirm: () => void;
  onCancel: () => void;
};

export default function NukeDbDialog({ onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  if (typeof document === 'undefined') return null;

  const prevent = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Nuke database"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title" style={{ color: 'var(--danger, #dc2626)' }}>
          Nuke entire database?
        </h2>
        <p className="dialog-body">
          This will permanently delete <strong>all tables, columns, rows, remarks, flags</strong>,
          and every other record across <strong>all configured databases</strong>. There is no undo.
        </p>
        <p className="dialog-body">
          Type <strong>{REQUIRED}</strong> to confirm:
        </p>
        <input
          ref={inputRef}
          className="dialog-confirm-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onPaste={prevent}
          onDrop={prevent}
          onCopy={prevent}
          onCut={prevent}
          onContextMenu={(e) => e.preventDefault()}
          autoComplete="off"
          spellCheck={false}
          placeholder={REQUIRED}
        />
        <div className="dialog-actions">
          <button type="button" className="dialog-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-danger"
            disabled={typed !== REQUIRED}
            onClick={onConfirm}
          >
            NUKE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
