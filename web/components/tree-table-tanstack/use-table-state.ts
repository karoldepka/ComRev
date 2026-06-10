"use client";

import { useState, useCallback, useMemo } from "react";
import type { ColumnFiltersState, ColumnVisibilityState } from "@tanstack/react-table";
import type { ColNode, ColType, RowData } from "@/lib/table-types";

// --- pure helpers ---

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

function computeVisibility(
  nodes: ColNode[],
  userHiddenIds: Set<string>
): ColumnVisibilityState {
  const vis: ColumnVisibilityState = {};
  function walk(node: ColNode, parentHidden: boolean) {
    const hidden = parentHidden || userHiddenIds.has(node.id);
    vis[node.id] = !hidden;
    node.children.forEach((c) => walk(c, hidden));
  }
  nodes.forEach((n) => walk(n, false));
  return vis;
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

// --- hook ---

export function useTableState(initialColumns: ColNode[], initialRows: RowData[]) {
  const [columns, setColumns] = useState(initialColumns);
  const [rows] = useState(initialRows);
  const [userHiddenIds, setUserHiddenIds] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columnVisibility = useMemo(
    () => computeVisibility(columns, userHiddenIds),
    [columns, userHiddenIds]
  );

  const hiddenCounts = useMemo(
    () => countHidden(columns, userHiddenIds),
    [columns, userHiddenIds]
  );

  const addColumn = useCallback(
    (name: string, colType: ColType, parentId: string | null) => {
      const newNode: ColNode = { id: generateId(), name, colType, children: [] };
      setColumns((prev) => addToTree(prev, parentId, newNode));
    },
    []
  );

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

  return { columns, rows, columnVisibility, hiddenCounts, userHiddenIds, columnFilters, setColumnFilters, addColumn, hideColumn, showColumn };
}
