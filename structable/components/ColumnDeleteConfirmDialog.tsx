'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  columnLabel: string;
  notesCount: number;
  commentsCount: number;
  flagsCount: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ColumnDeleteConfirmDialog({
  columnLabel, notesCount, commentsCount, flagsCount, onConfirm, onCancel,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  const n = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete column"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">Delete column?</h2>
        <p className="dialog-body">
          Do you want to delete the column <strong>{columnLabel}</strong>?
          This will also delete{' '}
          <strong>{n(commentsCount, 'comment', 'comments')}</strong>,{' '}
          <strong>{n(notesCount, 'note', 'notes')}</strong>, and{' '}
          <strong>{n(flagsCount, 'flag', 'flags')}</strong>.
        </p>
        <div className="dialog-actions">
          <button type="button" className="dialog-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dialog-btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
