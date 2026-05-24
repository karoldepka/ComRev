"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type ColGroupDef,
} from "ag-grid-community";
import type { ColNode, ColType, RowData } from "@/lib/table-types";
import { AddColumnDialog } from "@/components/tree-table/AddColumnDialog";
import { ColumnVisibilityPanel } from "@/components/tree-table/ColumnVisibilityPanel";

ModuleRegistry.registerModules([AllCommunityModule]);

// --- helpers ---

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function addToTree(nodes: ColNode[], parentId: string | null, node: ColNode): ColNode[] {
  if (!parentId) return [...nodes, node];
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, node] }
      : { ...n, children: addToTree(n.children, parentId, node) }
  );
}

function countHidden(
  nodes: ColNode[],
  userHiddenIds: Set<string>,
  depth = 0
): { root: number; sub: number } {
  let root = 0, sub = 0;
  for (const node of nodes) {
    if (userHiddenIds.has(node.id)) depth === 0 ? root++ : sub++;
    const c = countHidden(node.children, userHiddenIds, depth + 1);
    root += c.root;
    sub += c.sub;
  }
  return { root, sub };
}

function isHiddenByAncestor(node: ColNode, userHiddenIds: Set<string>): boolean {
  return userHiddenIds.has(node.id);
}

function buildAgDefs(
  nodes: ColNode[],
  userHiddenIds: Set<string>,
  ancestorHidden: boolean,
  onHide: (id: string) => void
): (ColDef | ColGroupDef)[] {
  return nodes.map((node) => {
    const hidden = ancestorHidden || userHiddenIds.has(node.id);
    if (node.children.length > 0) {
      return {
        groupId: node.id,
        headerName: node.name,
        marryChildren: true,
        children: buildAgDefs(node.children, userHiddenIds, hidden, onHide),
      } as ColGroupDef;
    }
    return {
      colId: node.id,
      field: node.id,
      headerName: node.name,
      hide: hidden,
      minWidth: 110,
      headerComponent: LeafHeader,
      headerComponentParams: { colId: node.id, onHide },
      cellRenderer: (params: { value: unknown }) =>
        renderCellValue(params.value, node.colType),
    } as ColDef;
  });
}

function renderCellValue(value: unknown, colType: ColType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean" || colType === "boolean") return value ? "✓" : "✗";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function hiddenLabel(root: number, sub: number) {
  return (
    [
      root > 0 && `${root} column${root !== 1 ? "s" : ""}`,
      sub > 0 && `${sub} sub-column${sub !== 1 ? "s" : ""}`,
    ]
      .filter(Boolean)
      .join(" · ") + " hidden"
  );
}

// Custom leaf header with hide button
function LeafHeader(props: {
  displayName: string;
  colId: string;
  onHide: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 w-full group/hdr">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 truncate">
        {props.displayName}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); props.onHide(props.colId); }}
        title="Hide"
        className="opacity-0 group-hover/hdr:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 text-xs leading-none shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

// --- component ---

interface Props {
  initialColumns: ColNode[];
  initialRows: RowData[];
}

export function AgGridTable({ initialColumns, initialRows }: Props) {
  const [columns, setColumns] = useState(initialColumns);
  const [userHiddenIds, setUserHiddenIds] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showHiddenPanel, setShowHiddenPanel] = useState(false);

  const hideColumn = useCallback((id: string) => {
    setUserHiddenIds((prev) => new Set([...prev, id]));
  }, []);

  const showColumn = useCallback((id: string) => {
    setUserHiddenIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }, []);

  const addColumn = useCallback((name: string, colType: ColType, parentId: string | null) => {
    const newNode: ColNode = { id: generateId(), name, colType, children: [] };
    setColumns((prev) => addToTree(prev, parentId, newNode));
  }, []);

  const columnDefs = useMemo<(ColDef | ColGroupDef)[]>(
    () => [
      {
        colId: "__name__",
        field: "name",
        headerName: "Project",
        pinned: "left",
        lockPinned: true,
        suppressMovable: true,
        minWidth: 160,
        cellStyle: { fontWeight: 500 },
        headerClass: "ag-header-name",
      } as ColDef,
      ...buildAgDefs(columns, userHiddenIds, false, hideColumn),
    ],
    [columns, userHiddenIds, hideColumn]
  );

  const hiddenCounts = useMemo(
    () => countHidden(columns, userHiddenIds),
    [columns, userHiddenIds]
  );
  const hiddenTotal = hiddenCounts.root + hiddenCounts.sub;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 font-medium"
        >
          + Add column
        </button>
        <div className="relative">
          {hiddenTotal > 0 && (
            <button
              onClick={() => setShowHiddenPanel((v) => !v)}
              className="px-3 py-1.5 text-sm border rounded-md bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
            >
              {hiddenLabel(hiddenCounts.root, hiddenCounts.sub)}
            </button>
          )}
          {showHiddenPanel && (
            <ColumnVisibilityPanel
              columns={columns}
              userHiddenIds={userHiddenIds}
              onShow={showColumn}
              onClose={() => setShowHiddenPanel(false)}
            />
          )}
        </div>
      </div>

      {/* AG Grid */}
      <div style={{ height: 320 }}>
        <AgGridReact
          theme={themeQuartz}
          rowData={initialRows}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: true, minWidth: 80 }}
          suppressColumnVirtualisation
          domLayout="normal"
        />
      </div>

      {showAddDialog && (
        <AddColumnDialog
          columns={columns}
          onAdd={(name, colType, parentId) => {
            addColumn(name, colType, parentId);
            setShowAddDialog(false);
          }}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
