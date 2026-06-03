'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApiCustomColumn } from '../types/table';

export type ColumnPropertiesPayload = {
  source_path: string[] | null;
  title?: string | null;
};

type Props = {
  column: ApiCustomColumn;
  onSave: (columnId: string, payload: ColumnPropertiesPayload) => void;
  onClose: () => void;
};

function pathToString(path: string[] | null | undefined): string {
  return path?.join('.') ?? '';
}

function stringToPath(s: string): string[] | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.split('.').map((p) => p.trim()).filter(Boolean);
}

export default function ColumnPropertiesDialog({ column, onSave, onClose }: Props) {
  const [titleStr, setTitleStr] = useState(() => column.title ?? '');
  const [pathStr, setPathStr] = useState(() => pathToString(column.source_path));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const handleSave = () => {
    onSave(column.id, {
      source_path: stringToPath(pathStr),
      title: titleStr !== (column.title ?? '') ? titleStr : undefined,
    });
    onClose();
  };

  const currentPath = pathToString(column.source_path);
  const isDirty = titleStr !== (column.title ?? '') || pathStr !== currentPath;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Column properties"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">Column properties</h2>

        <label className="dialog-field">
          <span className="dialog-label">Column ID</span>
          <input
            value={column.id}
            readOnly
            className="dialog-input-readonly"
            onFocus={(e) => e.target.select()}
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Title</span>
          <input
            autoFocus
            value={titleStr}
            onChange={(e) => setTitleStr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && isDirty) handleSave(); }}
            placeholder="Column display name"
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">
            Data path
            <span className="dialog-hint"> — dot-separated JSON path in row data, e.g. <code>stars_diff.6h</code></span>
          </span>
          <input
            value={pathStr}
            onChange={(e) => setPathStr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && isDirty) handleSave(); }}
            placeholder="e.g. stars_diff.6h"
          />
        </label>

        <div className="dialog-actions">
          <button type="button" className="dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-primary"
            disabled={!isDirty}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
