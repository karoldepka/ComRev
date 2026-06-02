'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { nanoid } from 'nanoid';

export type AddRowPayload = {
  id: string;
  title: string;
};

type Props = {
  onConfirm: (payload: AddRowPayload) => void;
  onClose: () => void;
};

function titleToId(t: string): string {
  return t.trim().replace(/\s+/g, '_');
}

export default function AddRowDialog({ onConfirm, onClose }: Props) {
  const [title, setTitle]         = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customId, setCustomId]   = useState('');
  const [idEdited, setIdEdited]   = useState(false);

  const canSubmit = title.trim().length > 0;

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (showAdvanced && !idEdited) setCustomId(titleToId(v));
  };

  const handleAdvancedToggle = () => {
    setShowAdvanced((v) => {
      if (!v && !idEdited) setCustomId(titleToId(title));
      return !v;
    });
  };

  const handleIdChange = (v: string) => {
    setCustomId(v.replace(/\s/g, '_'));
    setIdEdited(true);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({ id: customId.trim() || nanoid(), title: title.trim() });
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
        aria-label="Add row"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">Add row</h2>

        <label className="dialog-field">
          <span className="dialog-label">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
            placeholder="e.g. My project"
          />
        </label>

        <button
          type="button"
          className="dialog-advanced-toggle"
          onClick={handleAdvancedToggle}
        >
          {showAdvanced ? '▾' : '▸'} Advanced
        </button>

        {showAdvanced && (
          <label className="dialog-field">
            <span className="dialog-label">
              Row ID
              <span className="dialog-hint"> — default: auto-generated</span>
            </span>
            <input
              value={customId}
              onChange={(e) => handleIdChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
              placeholder="auto-generated nanoid"
            />
          </label>
        )}

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
            Add row
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
