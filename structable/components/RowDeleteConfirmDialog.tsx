'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  rowLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function RowDeleteConfirmDialog({ rowLabel, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete row"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">Delete row?</h2>
        <p className="dialog-body">
          Delete row <strong>{rowLabel}</strong>? This cannot be undone.
        </p>
        <div className="dialog-actions">
          <button type="button" className="dialog-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dialog-btn-danger" autoFocus onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
