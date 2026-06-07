'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Column ids that are reserved by the built-in table schema.
const BUILTIN_IDS = new Set([
  'id', 'when_created', 'who_created', 'when_last_modified', 'who_last_modified', 'custom_values',
]);

export type AddColumnPayload = {
  title: string;
  columnType: ColumnDataType;
  /** null → caller generates a nanoid */
  customId: string | null;
  description: string | null;
  expression: string | null;
};

export type ColumnDataType = 'text' | 'rating';

type Props = {
  afterColId: string;
  /** All stable column ids already in use. */
  existingNames: Set<string>;
  onConfirm: (afterColId: string, payload: AddColumnPayload) => void;
  onClose: () => void;
};

export default function AddColumnDialog({ afterColId, existingNames, onConfirm, onClose }: Props) {
  const [label, setLabel]           = useState('');
  const [columnType, setColumnType] = useState<ColumnDataType>('text');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customId, setCustomId]     = useState('');

  const derivedId = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const candidateId = customId.trim() || derivedId;

  const idError: string | null = (() => {
    if (!showAdvanced || !customId.trim()) return null;
    const id = customId.trim();
    if (BUILTIN_IDS.has(id)) return `"${id}" is a built-in reserved column id`;
    if (existingNames.has(id))  return `"${id}" already exists in this table`;
    return null;
  })();

  const canSubmit = label.trim().length > 0 && candidateId.length > 0 && !idError;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm(afterColId, {
      title: label.trim(),
      columnType,
      customId: customId.trim() || null,
      description: description.trim() || null,
      expression: expression.trim() || null,
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
        aria-label="Add column"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">Add column</h2>

        <label className="dialog-field">
          <span className="dialog-label">Title</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
            placeholder="e.g. My rating"
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Data type</span>
          <select
            value={columnType}
            onChange={(e) => setColumnType(e.target.value as ColumnDataType)}
          >
            <option value="text">Text</option>
            <option value="rating">0..5 star rating</option>
          </select>
        </label>

        <label className="dialog-field">
          <span className="dialog-label">
            Description
            <span className="dialog-hint"> — optional</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this column represent?"
            rows={2}
          />
        </label>

        <label className="dialog-field">
          <span className="dialog-label">
            Expression
            <span className="dialog-hint"> — optional JS, e.g. <code>row.stars * 2</code></span>
          </span>
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
            placeholder="Leave blank for user-entered values"
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
              Column ID
              <span className="dialog-hint"> — default: {derivedId || 'auto-generated'}</span>
            </span>
            <input
              value={customId}
              onChange={(e) => setCustomId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
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
            Add column
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
