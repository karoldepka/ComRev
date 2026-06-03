'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  confirmationPhrase: string;
  title: string;
  description: React.ReactNode;
  buttonLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function NukeDbDialog({
  confirmationPhrase,
  title,
  description,
  buttonLabel = 'NUKE',
  onConfirm,
  onCancel,
}: Props) {
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
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title" style={{ color: 'var(--danger, #dc2626)' }}>
          {title}
        </h2>
        <div className="dialog-body">{description}</div>
        <p className="dialog-body">
          Type <strong>{confirmationPhrase}</strong> to confirm:
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
          placeholder={confirmationPhrase}
        />
        <div className="dialog-actions">
          <button type="button" className="dialog-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-danger"
            disabled={typed !== confirmationPhrase}
            onClick={onConfirm}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
