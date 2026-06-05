"use client";

import { useState, useEffect } from "react";
import type { ColNode } from "@/lib/table-types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

const MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (powerful)" },
];

interface AiFillResult {
  rows_processed: number;
  cells_filled: number;
  errors: string[];
}

interface Props {
  tableId: string;
  columns: ColNode[];
  onClose: () => void;
}

// Flatten a column tree into leaf columns only (groups can't be filled).
function flattenLeafCols(
  nodes: ColNode[],
  prefix = ""
): { id: string; label: string }[] {
  return nodes.flatMap((n) => {
    const label = prefix + n.name;
    if (n.children.length > 0) return flattenLeafCols(n.children, label + " / ");
    return [{ id: n.id, label }];
  });
}

function ColPickerList({
  title,
  cols,
  selected,
  onChange,
}: {
  title: string;
  cols: { id: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {title}
      </p>
      <div className="border rounded-md overflow-y-auto max-h-44 divide-y">
        {cols.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">No columns</p>
        )}
        {cols.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="accent-orange-500"
            />
            <span className="truncate">{c.label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-400">{selected.size} selected</p>
    </div>
  );
}

export function AiFillDialog({ tableId, columns, onClose }: Props) {
  const leafCols = flattenLeafCols(columns);

  const [sourceCols, setSourceCols] = useState<Set<string>>(new Set());
  const [targetCols, setTargetCols] = useState<Set<string>>(new Set());
  const [instructions, setInstructions] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiFillResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Persist API key in localStorage so users don't have to retype it.
  useEffect(() => {
    const saved = localStorage.getItem("ai_fill_api_key");
    if (saved) setApiKey(saved);
  }, []);

  function handleApiKeyChange(val: string) {
    setApiKey(val);
    localStorage.setItem("ai_fill_api_key", val);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setRequestError(null);

    if (sourceCols.size === 0) {
      setRequestError("Select at least one source column.");
      return;
    }
    if (targetCols.size === 0) {
      setRequestError("Select at least one target column.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/tables/${tableId}/ai-fill`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_column_ids: Array.from(sourceCols),
            target_column_ids: Array.from(targetCols),
            instructions: instructions || null,
            api_key: apiKey || null,
            model,
            only_empty: onlyEmpty,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        setRequestError(`Server error ${response.status}: ${text}`);
        return;
      }

      const data: AiFillResult = await response.json();
      setResult(data);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    !loading && sourceCols.size > 0 && targetCols.size > 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-[640px] max-w-full max-h-[90vh] overflow-y-auto flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">AI Fill columns</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {!result ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {/* Column pickers */}
            <div className="grid grid-cols-2 gap-4">
              <ColPickerList
                title="Source columns (AI reads)"
                cols={leafCols}
                selected={sourceCols}
                onChange={setSourceCols}
              />
              <ColPickerList
                title="Target columns (AI fills)"
                cols={leafCols}
                selected={targetCols}
                onChange={setTargetCols}
              />
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Instructions (optional)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                placeholder="e.g. Answer in one short sentence. Use 'N/A' when data is unknown."
                className="w-full border rounded-md px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Model + only_empty */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col justify-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyEmpty}
                    onChange={(e) => setOnlyEmpty(e.target.checked)}
                    className="accent-orange-500"
                  />
                  Only fill empty cells
                </label>
              </div>
            </div>

            {/* API key */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Anthropic API key{" "}
                <span className="text-gray-400 font-normal">
                  (leave blank to use server ANTHROPIC_API_KEY)
                </span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                autoComplete="off"
              />
            </div>

            {requestError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {requestError}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 text-sm rounded-md font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {loading ? "Filling…" : "Run AI Fill"}
              </button>
            </div>
          </form>
        ) : (
          /* Results view */
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Rows processed" value={result.rows_processed} />
              <Stat label="Cells filled" value={result.cells_filled} />
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-1">
                  Errors ({result.errors.length})
                </p>
                <ul className="border border-red-200 rounded-md bg-red-50 divide-y divide-red-100 max-h-48 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i} className="px-3 py-1.5 text-xs text-red-700 font-mono">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setResult(null)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Run again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-md font-medium bg-orange-500 text-white hover:bg-orange-600"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-lg px-4 py-3 text-center">
      <p className="text-2xl font-bold text-orange-500">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
