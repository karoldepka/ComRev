'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { nanoid } from 'nanoid';
import type { DataRow } from '../types/table';
import { rowVal } from '../utils/rowVal';

export type AddRowPayload = {
  id: string;
  title: string;
};

type Props = {
  onConfirm: (payload: AddRowPayload) => void;
  onClose: () => void;
  parentRows?: DataRow[];
};

function titleToId(t: string): string {
  return t.trim().replace(/\s+/g, '_');
}

function rowTitle(row: DataRow): string {
  const value = rowVal(row, 'full_name') ?? rowVal(row, 'fullName') ?? rowVal(row, 'name') ?? rowVal(row, 'title') ?? rowVal(row, 'id');
  const text = value == null ? '' : String(value).trim();
  return text || 'Untitled row';
}

export default function AddRowDialog({ onConfirm, onClose, parentRows = [] }: Props) {
  const [title, setTitle]         = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customId, setCustomId]   = useState('');
  const [idEdited, setIdEdited]   = useState(false);

  const canSubmit = title.trim().length > 0;
  const isChild = parentRows.length > 0;
  const headingText = isChild ? 'Add child row' : 'Add row';
  const submitText = isChild ? 'Add child' : 'Add row';
  const parentSummary = isChild
    ? `Add child of ${parentRows.map(rowTitle).join(', ')}`
    : null;

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
        aria-label={headingText}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">{headingText}</h2>
        {parentSummary && <p className="dialog-context">{parentSummary}</p>}

        <label className="dialog-field">
          <span className="dialog-label">Full Name</span>
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
            {submitText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
