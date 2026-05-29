'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type AddTablePayload = {
  title: string;
  description: string | null;
};

type Props = {
  onConfirm: (payload: AddTablePayload) => void;
  onClose: () => void;
};

export default function AddTableDialog({ onConfirm, onClose }: Props) {
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');

  const canSubmit = title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({ title: title.trim(), description: description.trim() || null });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New table"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">New table</h2>

        <label className="dialog-field">
          <span className="dialog-label">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
            placeholder="e.g. My comparison"
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">
            Description
            <span className="dialog-hint"> — optional</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this table for?"
            rows={2}
          />
        </label>

        <div className="dialog-actions">
          <button type="button" className="dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Create table
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
