"use client";

import { useState } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

const DEFAULT_SOURCE_FIELDS = [
  { id: "full_name", label: "Full Name" },
  { id: "description", label: "Description" },
  { id: "url", label: "URL" },
  { id: "topics", label: "Topics" },
  { id: "readme", label: "README" },
  { id: "language", label: "Language" },
  { id: "owner_login", label: "Owner" },
];

interface AiFillClassesResult {
  rows_processed: number;
  classes_assigned: number;
  classes_created: number;
  errors: string[];
}

interface Props {
  tableId: string;
  onClose: () => void;
}

export function AiFillClassesDialog({ tableId, onClose }: Props) {
  const [ollamaModel, setOllamaModel] = useState(() =>
    localStorage.getItem("ai_fill_classes_model") ?? "llama3.2"
  );
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => new Set(DEFAULT_SOURCE_FIELDS.map((f) => f.id))
  );
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [createNew, setCreateNew] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiFillClassesResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  function handleModelChange(val: string) {
    setOllamaModel(val);
    localStorage.setItem("ai_fill_classes_model", val);
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
    setResult(null);
    setRequestError(null);

    if (!ollamaModel.trim()) {
      setRequestError("Ollama model name is required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/tables/${tableId}/ai-fill-classes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ollama_model: ollamaModel.trim(),
            source_field_ids: Array.from(selectedFields),
            only_empty: onlyEmpty,
            create_new_classes: createNew,
            instructions: instructions || null,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        setRequestError(`Server error ${response.status}: ${text}`);
        return;
      }

      const data: AiFillClassesResult = await response.json();
      setResult(data);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-[520px] max-w-full max-h-[90vh] overflow-y-auto flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">AI Fill — Classes</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Uses local Ollama to classify rows and assign Classes
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {!result ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {/* Ollama model */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Ollama model
              </label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => handleModelChange(e.target.value)}
                placeholder="e.g. llama3.2"
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                Must be running at <code>http://localhost:11434</code> (or set{" "}
                <code>OLLAMA_URL</code> on the server).
              </p>
            </div>

            {/* Source fields */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                Context fields to send to LLM
              </p>
              <div className="border rounded-md divide-y max-h-44 overflow-y-auto">
                {DEFAULT_SOURCE_FIELDS.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.has(f.id)}
                      onChange={() => toggleField(f.id)}
                      className="accent-orange-500"
                    />
                    <span>{f.label}</span>
                    <span className="text-gray-400 text-xs font-mono ml-auto">
                      {f.id}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyEmpty}
                  onChange={(e) => setOnlyEmpty(e.target.checked)}
                  className="accent-orange-500"
                />
                Only process rows without classes
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={createNew}
                  onChange={(e) => setCreateNew(e.target.checked)}
                  className="accent-orange-500"
                />
                Allow LLM to create new classes when needed
              </label>
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Extra instructions{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                placeholder="e.g. Focus on the primary programming language or domain."
                className="w-full border rounded-md px-3 py-2 text-sm resize-none"
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
                disabled={loading || selectedFields.size === 0}
                className="px-4 py-2 text-sm rounded-md font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {loading ? "Classifying…" : "Run AI Fill Classes"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Rows processed" value={result.rows_processed} />
              <Stat label="Classes assigned" value={result.classes_assigned} />
              <Stat label="New classes created" value={result.classes_created} />
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-1">
                  Errors ({result.errors.length})
                </p>
                <ul className="border border-red-200 rounded-md bg-red-50 divide-y divide-red-100 max-h-48 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li
                      key={i}
                      className="px-3 py-1.5 text-xs text-red-700 font-mono"
                    >
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
    <div className="border rounded-lg px-3 py-3 text-center">
      <p className="text-2xl font-bold text-orange-500">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
