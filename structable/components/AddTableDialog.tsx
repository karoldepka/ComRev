'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const ALLOW_TABLE_NAME_UPPERCASE =
  process.env.NEXT_PUBLIC_ALLOW_TABLE_NAME_UPPERCASE === 'true';

export type AddTablePayload = {
  title: string;
  description: string | null;
  customId: string | null;
};

type Props = {
  onConfirm: (payload: AddTablePayload) => void;
  onClose: () => void;
};

export default function AddTableDialog({ onConfirm, onClose }: Props) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customId, setCustomId]       = useState('');

  const idPattern = ALLOW_TABLE_NAME_UPPERCASE ? /^[a-zA-Z0-9_-]+$/ : /^[a-z0-9_-]+$/;
  const idClean   = ALLOW_TABLE_NAME_UPPERCASE ? /[^a-zA-Z0-9_-]/g  : /[^a-z0-9_-]/g;
  const idHint    = ALLOW_TABLE_NAME_UPPERCASE
    ? 'Only letters, numbers, _ and - allowed'
    : 'Only lowercase letters, numbers, _ and - allowed';

  const derivedId = title.trim()
    .replace(/\s+/g, '_')
    .replace(idClean, '')
    .replace(ALLOW_TABLE_NAME_UPPERCASE ? /(?:)/ : /[A-Z]/g, c => c.toLowerCase());

  const idError: string | null = (() => {
    if (!showAdvanced || !customId.trim()) return null;
    if (!idPattern.test(customId.trim())) return idHint;
    return null;
  })();

  const canSubmit = title.trim().length > 0 && !idError;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      title: title.trim(),
      description: description.trim() || null,
      customId: customId.trim() || null,
    });
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

        <button
          type="button"
          className="dialog-advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? '▾' : '▸'} Advanced
        </button>

        {showAdvanced && (
          <label className="dialog-field">
            <span className="dialog-label">
              Table ID
              <span className="dialog-hint"> — default: {derivedId || 'auto-generated'}</span>
            </span>
            <input
              value={customId}
              onChange={(e) => setCustomId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
              placeholder={derivedId || 'auto-generated nanoid'}
            />
            {idError && <span className="dialog-error">{idError}</span>}
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
            Create table
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
