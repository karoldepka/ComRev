"use client";

import { useState } from "react";
import type { ColNode, ColType } from "@/lib/table-types";

interface Props {
  columns: ColNode[];
  onAdd: (name: string, colType: ColType, parentId: string | null) => void;
  onClose: () => void;
}

function flattenCols(nodes: ColNode[], prefix = ""): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: prefix + n.name },
    ...flattenCols(n.children, prefix + n.name + " / "),
  ]);
}

export function AddColumnDialog({ columns, onAdd, onClose }: Props) {
  const [name, setName] = useState("");
  const [colType, setColType] = useState<ColType>("text");
  const [parentId, setParentId] = useState("");

  const allCols = flattenCols(columns);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) onAdd(name.trim(), colType, parentId || null);
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Add column</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Column name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={colType}
              onChange={(e) => setColType(e.target.value as ColType)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="text">Text</option>
              <option value="boolean">Boolean</option>
              <option value="number">Number</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Parent column
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Root level</option>
              {allCols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
