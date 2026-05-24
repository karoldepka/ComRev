"use client";

import type { ColNode } from "@/lib/table-types";

interface Props {
  columns: ColNode[];
  userHiddenIds: Set<string>;
  onShow: (id: string) => void;
  onClose: () => void;
}

function HiddenItems({
  nodes,
  hiddenIds,
  onShow,
  depth = 0,
}: {
  nodes: ColNode[];
  hiddenIds: Set<string>;
  onShow: (id: string) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (hiddenIds.has(node.id)) {
          return (
            <div
              key={node.id}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              className="flex items-center justify-between py-1.5 pr-3 hover:bg-gray-50 rounded"
            >
              <span className="text-sm text-gray-700">{node.name}</span>
              <button
                onClick={() => onShow(node.id)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline ml-4 shrink-0"
              >
                Show
              </button>
            </div>
          );
        }
        if (node.children.length > 0) {
          return (
            <HiddenItems
              key={node.id}
              nodes={node.children}
              hiddenIds={hiddenIds}
              onShow={onShow}
              depth={depth + 1}
            />
          );
        }
        return null;
      })}
    </>
  );
}

export function ColumnVisibilityPanel({ columns, userHiddenIds, onShow, onClose }: Props) {
  return (
    <div className="absolute top-full mt-1 right-0 bg-white border rounded-xl shadow-xl w-64 z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Hidden columns</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-sm leading-none"
        >
          ✕
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto py-2 px-1">
        <HiddenItems nodes={columns} hiddenIds={userHiddenIds} onShow={onShow} />
      </div>
    </div>
  );
}
