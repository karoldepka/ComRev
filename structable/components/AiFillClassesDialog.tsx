'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JobActions, RowLogEntry } from '../hooks/useJobs';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const DEFAULT_SOURCE_FIELDS = [
  { id: 'full_name',   label: 'Full Name' },
  { id: 'description', label: 'Description' },
  { id: 'url',         label: 'URL' },
  { id: 'topics',      label: 'Topics' },
  { id: 'readme',      label: 'README' },
  { id: 'language',    label: 'Language' },
  { id: 'owner_login', label: 'Owner' },
];

// SSE event shapes from the backend.
interface SseStart    { type: 'start'; total: number }
interface SseProgress { type: 'progress'; completed: number; total: number; classes_assigned: number; classes_created: number; error_count: number; row_id?: string; row_name?: string; had_error?: boolean }
interface SseDone     { type: 'done'; rows_processed: number; classes_assigned: number; classes_created: number; errors: string[] }
type SseEvent = SseStart | SseProgress | SseDone;

type Props = {
  tableId: string;
  jobActions: JobActions;
  onClose: () => void;
  /** Current sort string in `col:dir[:type]` format — passed to backend so it processes rows in view order. */
  sort?: string;
};

export default function AiFillClassesDialog({ tableId, jobActions, onClose, sort }: Props) {
  const [ollamaModel, setOllamaModel] = useState(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('ai_fill_classes_model') : null) ?? 'llama3.2'
  );
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => new Set(DEFAULT_SOURCE_FIELDS.map((f) => f.id))
  );
  const [onlyEmpty, setOnlyEmpty]   = useState(true);
  const [createNew, setCreateNew]   = useState(true);
  const [instructions, setInstructions] = useState('');
  const [enableWebSearch, setEnableWebSearch] = useState(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('ai_fill_web_search') === 'true' : false)
  );
  const [braveApiKey, setBraveApiKey] = useState(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('ai_fill_brave_api_key') : null) ?? ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleModelChange(val: string) {
    setOllamaModel(val);
    if (typeof localStorage !== 'undefined') localStorage.setItem('ai_fill_classes_model', val);
  }

  function handleWebSearchToggle(val: boolean) {
    setEnableWebSearch(val);
    if (typeof localStorage !== 'undefined') localStorage.setItem('ai_fill_web_search', String(val));
  }

  function handleBraveApiKeyChange(val: string) {
    setBraveApiKey(val);
    if (typeof localStorage !== 'undefined') localStorage.setItem('ai_fill_brave_api_key', val);
  }

  function toggleField(id: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(null);

    if (!ollamaModel.trim()) {
      setRequestError('Ollama model name is required.');
      return;
    }

    setSubmitting(true);

    // Register the job before closing, so the indicator appears immediately.
    const jobId = jobActions.startJob('AI Fill Classes');
    onClose(); // close dialog; job tracks in toolbar

    try {
      const res = await fetch(`${BACKEND_URL}/tables/${tableId}/ai-fill-classes-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ollama_model: ollamaModel.trim(),
          source_field_ids: Array.from(selectedFields),
          only_empty: onlyEmpty,
          create_new_classes: createNew,
          instructions: instructions || null,
          sort: sort ?? null,
          enable_web_search: enableWebSearch,
          brave_api_key: braveApiKey.trim() || null,
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        jobActions.failJob(jobId, `Server error ${res.status}: ${text}`);
        return;
      }

      // Read SSE stream and update the job as events arrive.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: SseEvent;
          try {
            event = JSON.parse(line.slice(6)) as SseEvent;
          } catch {
            continue;
          }

          if (event.type === 'start') {
            jobActions.updateJob(jobId, { total: event.total, detail: 'Starting…' });
          } else if (event.type === 'progress') {
            const appendToRowLog: RowLogEntry | undefined =
              event.row_id
                ? { id: event.row_id, name: event.row_name ?? event.row_id, status: event.had_error ? 'error' : 'done' }
                : undefined;
            jobActions.updateJob(jobId, {
              completed: event.completed,
              total: event.total,
              errorCount: event.error_count,
              detail: `${event.classes_assigned} classes assigned, ${event.classes_created} created`,
              appendToRowLog,
            });
          } else if (event.type === 'done') {
            const detail = [
              `${event.rows_processed} row${event.rows_processed !== 1 ? 's' : ''} processed`,
              `${event.classes_assigned} classes assigned`,
              event.classes_created > 0 ? `${event.classes_created} new classes created` : '',
            ].filter(Boolean).join(' · ');
            jobActions.finishJob(jobId, detail, event.errors);
          }
        }
      }
    } catch (err) {
      jobActions.failJob(jobId, err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const dialog = (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog ai-fill-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ai-fill-dialog-header">
          <div>
            <h2 className="dialog-title">✦ AI Fill — Classes</h2>
            <p className="dialog-hint" style={{ marginTop: 2 }}>
              Uses local Ollama to classify rows and assign Classes
            </p>
          </div>
          <button type="button" className="ai-fill-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} className="ai-fill-form">
          {/* Ollama model */}
          <div className="dialog-field">
            <label className="dialog-label">
              Ollama model{' '}
              <span className="dialog-hint">(must be running at localhost:11434)</span>
            </label>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder="llama3.2"
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          {/* Source fields */}
          <div className="dialog-field">
            <label className="dialog-label">Context fields to send to LLM</label>
            <div className="ai-fill-picker-list">
              {DEFAULT_SOURCE_FIELDS.map((f) => (
                <label key={f.id} className="ai-fill-picker-row">
                  <input
                    type="checkbox"
                    checked={selectedFields.has(f.id)}
                    onChange={() => toggleField(f.id)}
                  />
                  <span className="ai-fill-picker-label">
                    {f.label}
                    <span className="dialog-hint" style={{ marginLeft: 6, fontFamily: 'monospace' }}>
                      {f.id}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="ai-fill-options-row" style={{ flexDirection: 'column', gap: 6 }}>
            <label className="ai-fill-only-empty-label">
              <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
              Only process rows without classes
            </label>
            <label className="ai-fill-only-empty-label">
              <input type="checkbox" checked={createNew} onChange={(e) => setCreateNew(e.target.checked)} />
              Allow LLM to create new classes when needed
            </label>
          </div>

          {/* Web search */}
          <div className="dialog-field">
            <label className="ai-fill-only-empty-label">
              <input
                type="checkbox"
                checked={enableWebSearch}
                onChange={(e) => handleWebSearchToggle(e.target.checked)}
              />
              Enrich each row with web search (Brave Search API)
            </label>
            {enableWebSearch && (
              <input
                type="text"
                value={braveApiKey}
                onChange={(e) => handleBraveApiKeyChange(e.target.value)}
                placeholder="Brave Search API key (or set BRAVE_SEARCH_API_KEY env var)"
                style={{ marginTop: 6, fontFamily: 'monospace', fontSize: '0.82rem' }}
              />
            )}
          </div>

          {/* Extra instructions */}
          <div className="dialog-field">
            <label className="dialog-label">
              Extra instructions <span className="dialog-hint">(optional)</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              className="ai-fill-textarea"
              placeholder="e.g. Focus on primary domain or programming language."
            />
          </div>

          {requestError && <p className="dialog-error">{requestError}</p>}

          <div className="dialog-actions">
            <button type="button" className="dialog-btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="dialog-btn-primary ai-fill-submit"
              disabled={submitting || selectedFields.size === 0}
            >
              {submitting && <span className="ai-fill-spinner" />}
              {submitting ? 'Starting…' : 'Run AI Fill Classes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialog, document.body) : null;
}
