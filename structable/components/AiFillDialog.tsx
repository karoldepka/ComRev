'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApiCustomColumn } from '../types/table';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (balanced)' },
  { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8 (powerful)' },
  { id: 'ollama',                     label: 'Ollama (local)' },
];

interface AiFillResult {
  rows_processed: number;
  cells_filled: number;
  errors: string[];
}

type Props = {
  tableId: string;
  columns: ApiCustomColumn[];
  onClose: () => void;
};

type PickableColumn = { id: string; label: string };

function pickableCols(columns: ApiCustomColumn[]): PickableColumn[] {
  return columns
    .filter((cc) => !!cc.id)
    .map((cc) => {
      const title = cc.title?.trim();
      return { id: cc.id, label: title && title.length > 0 ? title : cc.id };
    });
}

function ColPickerList({
  title,
  cols,
  selected,
  onChange,
}: {
  title: string;
  cols: PickableColumn[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  return (
    <div className="ai-fill-picker">
      <p className="ai-fill-picker-title">{title}</p>
      <div className="ai-fill-picker-list">
        {cols.length === 0 && <p className="ai-fill-picker-empty">No columns</p>}
        {cols.map((c) => (
          <label key={c.id} className="ai-fill-picker-row">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="ai-fill-picker-label" title={c.id}>{c.label}</span>
          </label>
        ))}
      </div>
      <p className="ai-fill-picker-count">{selected.size} selected</p>
    </div>
  );
}

export default function AiFillDialog({ tableId, columns, onClose }: Props) {
  const cols = pickableCols(columns);

  const [sourceCols, setSourceCols]     = useState<Set<string>>(new Set());
  const [targetCols, setTargetCols]     = useState<Set<string>>(new Set());
  const [instructions, setInstructions] = useState('');
  const [provider, setProvider]         = useState(MODELS[0].id);
  const [ollamaModel, setOllamaModel]   = useState('llama3.2');
  const [apiKey, setApiKey]             = useState('');
  const [onlyEmpty, setOnlyEmpty]       = useState(true);
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<AiFillResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const isOllama = provider === 'ollama';

  useEffect(() => {
    const saved = localStorage.getItem('ai_fill_api_key');
    if (saved) setApiKey(saved);
  }, []);

  function handleApiKeyChange(val: string) {
    setApiKey(val);
    localStorage.setItem('ai_fill_api_key', val);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setRequestError(null);

    if (sourceCols.size === 0) { setRequestError('Select at least one source column.'); return; }
    if (targetCols.size === 0) { setRequestError('Select at least one target column.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/tables/${tableId}/ai-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_column_ids: Array.from(sourceCols),
          target_column_ids: Array.from(targetCols),
          instructions: instructions || null,
          api_key: isOllama ? null : (apiKey || null),
          model: isOllama ? null : provider,
          ollama_model: isOllama ? ollamaModel : null,
          only_empty: onlyEmpty,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setRequestError(`Server error ${res.status}: ${text}`);
        return;
      }

      setResult(await res.json() as AiFillResult);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && sourceCols.size > 0 && targetCols.size > 0;

  const dialog = (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog ai-fill-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ai-fill-dialog-header">
          <h2 className="dialog-title">✦ AI Fill columns</h2>
          <button type="button" className="ai-fill-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!result ? (
          <form onSubmit={submit} className="ai-fill-form">
            {/* Column pickers */}
            <div className="ai-fill-pickers">
              <ColPickerList title="Source columns (AI reads)" cols={cols} selected={sourceCols} onChange={setSourceCols} />
              <ColPickerList title="Target columns (AI fills)" cols={cols} selected={targetCols} onChange={setTargetCols} />
            </div>

            {/* Instructions */}
            <div className="dialog-field">
              <label className="dialog-label">
                Instructions <span className="dialog-hint">(optional)</span>
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                className="ai-fill-textarea"
                placeholder="e.g. Answer in one short sentence. Use N/A when unknown."
              />
            </div>

            {/* Provider + only_empty */}
            <div className="ai-fill-options-row">
              <div className="dialog-field" style={{ flex: 1 }}>
                <label className="dialog-label">Provider / model</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value)} className="ai-fill-select">
                  {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <label className="ai-fill-only-empty-label">
                <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
                Only fill empty cells
              </label>
            </div>

            {/* Ollama model name */}
            {isOllama && (
              <div className="dialog-field">
                <label className="dialog-label">
                  Ollama model <span className="dialog-hint">(must be running at localhost:11434)</span>
                </label>
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="llama3.2"
                />
              </div>
            )}

            {/* Anthropic API key (hidden for Ollama) */}
            {!isOllama && (
              <div className="dialog-field">
                <label className="dialog-label">
                  Anthropic API key <span className="dialog-hint">(leave blank to use server ANTHROPIC_API_KEY)</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            )}

            {requestError && <p className="dialog-error">{requestError}</p>}

            <div className="dialog-actions">
              <button type="button" className="dialog-btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="dialog-btn-primary ai-fill-submit" disabled={!canSubmit}>
                {loading && <span className="ai-fill-spinner" />}
                {loading ? 'Filling…' : 'Run AI Fill'}
              </button>
            </div>
          </form>
        ) : (
          <div className="ai-fill-result">
            <div className="ai-fill-stats">
              <div className="ai-fill-stat">
                <span className="ai-fill-stat-value">{result.rows_processed}</span>
                <span className="ai-fill-stat-label">Rows processed</span>
              </div>
              <div className="ai-fill-stat">
                <span className="ai-fill-stat-value">{result.cells_filled}</span>
                <span className="ai-fill-stat-label">Cells filled</span>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="ai-fill-errors">
                <p className="ai-fill-errors-title">Errors ({result.errors.length})</p>
                <ul className="ai-fill-errors-list">
                  {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            <div className="dialog-actions">
              <button type="button" className="dialog-btn-secondary" onClick={() => setResult(null)}>Run again</button>
              <button type="button" className="dialog-btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialog, document.body) : null;
}
