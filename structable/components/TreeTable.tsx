'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { getSyncClient, SyncClient } from '../services/syncClient';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import type { ColumnGroup } from '../hooks/useColumnPrefs';
import { useTableSelection } from '../hooks/useTableSelection';
import ContextMenu from './ContextMenu';
import AddColumnDialog from './AddColumnDialog';
import AddRowDialog from './AddRowDialog';
import type { AddRowPayload } from './AddRowDialog';
import ColumnDeleteConfirmDialog from './ColumnDeleteConfirmDialog';
import ColumnPropertiesDialog, { type ColumnPropertiesPayload } from './ColumnPropertiesDialog';
import CellContent from './CellContent';
import SyncIndicator from './SyncIndicator';
import { colFilterParam, type ColType } from '../utils/columnFilters';
import logger from '../utils/logger';

import { TableApi } from '../services/tableApi';
import type { ApiCustomColumn, ApiRemark, CellTarget, PagedResponse, RemarkTarget, DataRow } from '../types/table';

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
// ── Local types ────────────────────────────────────────────────────────────────

type Column = {
  id: string;
  label: string;
  width?: number;
  minWidth?: number;
  customColumnId?: string;
  readOnly?: boolean;
  isFrozen?: boolean;
  types?: string[];
  filterType?: ColType | null;
  subColumns?: Column[];
};

type HeaderCell = { column: Column; colSpan: number; rowSpan: number; depth: number };

// ── Utility functions ──────────────────────────────────────────────────────────

function labelFor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve a possibly dot-notated column id against a row object. */
export function rowVal(row: DataRow, id: string): unknown {
  const dot = id.indexOf('.');
  if (dot === -1) return row[id];
  const parent = row[id.slice(0, dot)];
  if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) return undefined;
  return (parent as Record<string, unknown>)[id.slice(dot + 1)];
}

function deriveColumns(row: DataRow): Column[] {
  const keys = Object.keys(row);
  const sorted = [...(keys.includes('name') ? ['name'] : []), ...keys.filter((k) => k !== 'name')];
  return sorted.map((key) => {
    const val = row[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return {
        id: key,
        label: labelFor(key),
        width: 80,
        minWidth: 40,
        subColumns: Object.keys(val as Record<string, unknown>).map((sub) => ({
          id: `${key}.${sub}`,
          label: sub,
          width: 70,
          minWidth: 40,
        })),
      };
    }
    return { id: key, label: labelFor(key), width: 120, minWidth: 60, isFrozen: key === 'name' };
  });
}

function isColumnReadOnly(cc: ApiCustomColumn): boolean {
  return cc.readOnly ?? cc.read_only ?? !(cc.is_editable ?? true);
}

function insertAfter(list: Column[], col: Column, positionAfter: string | null | undefined): void {
  const idx = positionAfter
    ? list.findIndex((c) => c.id === positionAfter || c.customColumnId === positionAfter)
    : -1;
  list.splice(idx >= 0 ? idx + 1 : list.length, 0, col);
}

/** Resolve the row-data key for a column.
 *  1. source_path from backend (authoritative)
 *  2. Stable column id for user-created values. `name` is user-facing/renameable. */
function resolveColumnId(cc: ApiCustomColumn): string {
  if ((cc.source_path?.length ?? 0) > 1) return cc.source_path!.join('.');
  if (cc.source_path?.[0]) return cc.source_path[0];
  return cc.id;
}

function columnsFromMetadata(customColumns: ApiCustomColumn[], _rowSample?: DataRow): Column[] {
  const colMap = new Map<string, Column>();
  for (const cc of customColumns) {
    colMap.set(cc.id, {
      id: resolveColumnId(cc),
      customColumnId: cc.id,
      label: cc.title ?? labelFor(cc.id),
      width: 150,
      minWidth: 60,
      readOnly: isColumnReadOnly(cc),
      isFrozen: cc.is_frozen ?? false,
      types: cc.types ?? ['text'],
      filterType: (cc.data_types?.[0] as ColType | undefined) ?? null,
    });
  }

  const root: Column[] = [];
  for (const cc of customColumns) {
    const col = colMap.get(cc.id)!;
    const parentId = cc.parent_ids?.length ? cc.parent_ids[cc.parent_ids.length - 1] : null;
    const parentCol = parentId ? colMap.get(parentId) : null;
    if (parentCol) {
      if (!parentCol.subColumns) parentCol.subColumns = [];
      insertAfter(parentCol.subColumns, col, cc.position_after);
    } else {
      insertAfter(root, col, cc.position_after);
    }
  }
  return root;
}

function getLeafColumns(cols: Column[]): Column[] {
  return cols.flatMap((c) => (c.subColumns ? getLeafColumns(c.subColumns) : [c]));
}

function getVisibleLeafColumns(col: Column, hidden: Set<string>): Column[] {
  if (!col.subColumns?.length) return hidden.has(col.id) ? [] : [col];
  return col.subColumns.flatMap((ch) => getVisibleLeafColumns(ch, hidden));
}

function getColumnDepth(cols: Column[]): number {
  return cols.reduce((d, c) => Math.max(d, c.subColumns ? 1 + getColumnDepth(c.subColumns) : 1), 0);
}

function buildHeaderRows(cols: Column[], maxDepth: number, hidden: Set<string>): HeaderCell[][] {
  const rows: HeaderCell[][] = Array.from({ length: maxDepth }, () => []);

  function traverse(col: Column, depth: number): { colSpan: number; visible: boolean } {
    const isLeaf = !col.subColumns?.length;
    if (isLeaf) {
      if (hidden.has(col.id)) return { colSpan: 0, visible: false };
      rows[depth - 1].push({ column: col, colSpan: 1, rowSpan: maxDepth - depth + 1, depth });
      return { colSpan: 1, visible: true };
    }
    const childResults = col.subColumns!.map((ch) => traverse(ch, depth + 1));
    const colSpan = childResults.reduce((s, r) => s + (r.visible ? r.colSpan : 0), 0);
    if (colSpan === 0) return { colSpan: 0, visible: false };
    rows[depth - 1].push({ column: col, colSpan, rowSpan: 1, depth });
    return { colSpan, visible: true };
  }

  cols.forEach((c) => traverse(c, 1));
  return rows.map((r) => r.filter((cell) => cell.colSpan > 0));
}

function applyColumnGroups(flatCols: Column[], groups: ColumnGroup[]): Column[] {
  if (groups.length === 0) return flatCols;
  const groupByChild = new Map<string, ColumnGroup>();
  for (const g of groups) {
    for (const cid of g.childIds) groupByChild.set(cid, g);
  }
  const result: Column[] = [];
  const processedGroups = new Set<string>();
  for (const col of flatCols) {
    const group = groupByChild.get(col.id);
    if (!group) { result.push(col); continue; }
    if (processedGroups.has(group.id)) continue;
    processedGroups.add(group.id);
    const children = flatCols.filter((c) => group.childIds.includes(c.id));
    result.push({ id: group.id, label: group.label, subColumns: children });
  }
  return result;
}

function errMsg(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
  // Tonic gRPC-web errors: 'status: Unknown, message: "js api error: TypeError: Failed to fetch"'
  if (raw.includes('js api error') && raw.includes('Failed to fetch')) return 'Cannot reach server';
  return raw;
}

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  tableId: string;
  onRowClick?: (rowId: string) => void;
};

export default function TreeTable({ tableId, onRowClick }: Props) {
  const [api, setApi] = useState<SyncClient | null>(null);
  const [syncPending, setSyncPending] = useState(0);
  const [cellPending, setCellPending] = useState(0);
  const pendingUploads = syncPending + cellPending;

  type PendingChange = { id: string; description: string; timestamp: number };
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [cellQueueSummary, setCellQueueSummary] = useState<PendingChange[]>([]);
  const [syncQueueSummary, setSyncQueueSummary] = useState<PendingChange[]>([]);
  const recordChange = useCallback((description: string) => {
    const id = nanoid();
    setPendingChanges((prev) => [{ id, description, timestamp: Date.now() }, ...prev].slice(0, 50));
  }, []);

  // Separate TableApi instance for cell-value edits (REST + IDB queue).
  // Created once; stable setter ref keeps onQueueChange wiring correct.
  const cellApiRef = useRef<TableApi | null>(null);
  if (!cellApiRef.current && typeof window !== 'undefined') {
    cellApiRef.current = new TableApi({
      baseUrl: API_BASE,
      tableId,
      onError: (msg) => toast.error(msg),
      onQueueChange: (count) => {
        setCellPending(count);
        setCellQueueSummary(cellApiRef.current?.getQueueSummary() ?? []);
      },
    });
  }
  cellApiRef.current?.setTableId(tableId);

  // ── Inline cell editing ────────────────────────────────────────────────────
  type EditingCell = { rowIndex: number; rowId: string; colId: string; value: string };
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  useEffect(() => {
    getSyncClient()
      .then(setApi)
      .catch((err) => toast.error(`Sync init failed: ${errMsg(err)}`));
  }, []);

  useEffect(() => {
    setRows([]);
    setCustomColumns([]);
    setTotal(0);
    setPage(1);
    setFetchError(null);
  }, [tableId]);

  useEffect(() => {
    if (!api) return;
    const sub = api.queueLength$.subscribe(setSyncPending);
    return () => sub.unsubscribe();
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const sub = api.events$.subscribe((ev) => {
      if ('store_error' in ev) {
        toast.error(`Store error (${ev.store_error.method}): ${ev.store_error.message}`, {
          id: `store-error-${ev.store_error.method}`,
          duration: 8000,
        });
      }
    });
    return () => sub.unsubscribe();
  }, [api]);

  // Fetch queue summary outside the WASM callback to avoid RefCell reentrancy:
  // notify_queue_change() is called while borrow_mut() is held inside do_flush,
  // so calling getQueueSummary() (which borrows) synchronously in the subscriber
  // would panic. A separate effect runs after the React render cycle instead.
  useEffect(() => {
    if (!api) return;
    setSyncQueueSummary(
      api.getQueueSummary().map((item) => ({ ...item, timestamp: item.enqueued_at || Date.now() }))
    );
  }, [api, syncPending]);

  // Clear pending changes list 3s after everything is synced
  useEffect(() => {
    if (pendingUploads > 0) return;
    const t = setTimeout(() => setPendingChanges([]), 3000);
    return () => clearTimeout(t);
  }, [pendingUploads]);

  // ── Repo data ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<DataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [bootstrapRetryKey, setBootstrapRetryKey] = useState(0);
  const [customColsRetryKey, setCustomColsRetryKey] = useState(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customColsRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Column prefs (widths + order + groups) ────────────────────────────────
  const {
    columnWidths, setColumnWidths,
    columnOrder,
    reorderColumns,
    columnGroups,
    addColumnGroup,
    addToGroup,
    removeColumnGroup,
    updateGroupLabel,
  } = useColumnPrefs();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Column state ───────────────────────────────────────────────────────────
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [customColumns, setCustomColumns] = useState<ApiCustomColumn[]>([]);

  // ── Drag-to-reorder / drag-to-group state ─────────────────────────────────
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragGroupTarget, setDragGroupTarget] = useState<string | null>(null);

  // ── Inline group-label editing ─────────────────────────────────────────────
  const [editingGroupLabel, setEditingGroupLabel] = useState<Record<string, string>>({});

  // ── Hidden rows (optimistic local set) ────────────────────────────────────
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());

  // ── Column menu state ──────────────────────────────────────────────────────
  const [openMenuColumn, setOpenMenuColumn] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [headerMenuMode, setHeaderMenuMode] = useState<'menu' | 'flag' | 'note' | 'comment'>('menu');
  // ── Add-column / add-row dialogs ──────────────────────────────────────────
  const [addColAfter, setAddColAfter] = useState<string | null>(null);
  const [showAddRowDialog, setShowAddRowDialog] = useState(false);
  type PendingDelete = { colId: string; label: string; notes: number; comments: number; flags: number };
  const [pendingDeleteCol, setPendingDeleteCol] = useState<PendingDelete | null>(null);
  const [propertiesCol, setPropertiesCol] = useState<ApiCustomColumn | null>(null);

  // ── Sort & filter ──────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc'; colType?: string }>({ col: 'stars_diff.14d', dir: 'desc' });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});

  // ── Cell remarks (unified notes + comments) ───────────────────────────────
  const [cellRemarks, setCellRemarks] = useState<Record<string, ApiRemark[]>>({});
  const [cellFlags, setCellFlags] = useState<Record<string, string>>({});

  // ── Cell menu state ────────────────────────────────────────────────────────
  const [cellMenu, setCellMenu] = useState<{ anchor: { top: number; left: number }; targets: CellTarget[] } | null>(null);
  const [cellMenuMode, setCellMenuMode] = useState<'menu' | 'note' | 'comment' | 'flag'>('menu');
  const [draftText, setDraftText] = useState('');
  const [addColFocused, setAddColFocused] = useState(false);

  const resizingRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const perPage = 50;

  // ── Bootstrap: load flags, hidden columns, hidden rows, remarks ───────────
  useEffect(() => {
    if (!api) return;
    const doBootstrap = async () => {
      try {
        const [flagsData, hiddenColsData, hiddenRowsData, remarksData] = await Promise.all([
          api.fetchFlags(),
          api.fetchHiddenColumns(),
          api.fetchHiddenRows(),
          api.fetchRemarks(),
        ]);

        const flagMap: Record<string, string> = {};
        flagsData.forEach((f) => { flagMap[f.key] = f.color; });

        setHiddenColumns(hiddenColsData.map((c) => c.column_id));
        setCellFlags(flagMap);
        setHiddenRowIds(new Set(hiddenRowsData.map((r) => r.row_id)));

        // Build cellRemarks: each remark appears in every target cell's list
        const remarkMap: Record<string, ApiRemark[]> = {};
        for (const r of remarksData) {
          for (const t of r.targets) {
            const key = `${t.row_id}:${t.column_id}`;
            if (!remarkMap[key]) remarkMap[key] = [];
            remarkMap[key].push(r);
          }
        }
        setCellRemarks(remarkMap);
        setBootstrapping(false);
      } catch (err) {
        toast.error(`Failed to load remarks: ${errMsg(err)}`, { id: 'bootstrap-error' });
        bootstrapRetryTimerRef.current = setTimeout(() => {
          bootstrapRetryTimerRef.current = null;
          setBootstrapRetryKey((k) => k + 1);
        }, 1_000);
      }
    };
    doBootstrap();
    return () => {
      if (bootstrapRetryTimerRef.current !== null) { clearTimeout(bootstrapRetryTimerRef.current); bootstrapRetryTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, bootstrapRetryKey]);

  // ── Fetch data rows (with abort to prevent race conditions) ───────────────
  useEffect(() => {
    if (!api) return;
    fetchAbortRef.current?.abort();
    if (fetchRetryTimerRef.current !== null) { clearTimeout(fetchRetryTimerRef.current); fetchRetryTimerRef.current = null; }
    const aborter = new AbortController();
    fetchAbortRef.current = aborter;

    setLoading(true);
    setFetchError(null);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort: sort.colType ? `${sort.col}:${sort.dir}:${sort.colType}` : `${sort.col}:${sort.dir}`,
    });
    Object.entries(filters).forEach(([k, v]) => params.set(k, v));
    api.fetchDataRows(tableId, params, aborter.signal)
      .then((payload: PagedResponse) => {
        setRows(payload.data);
        setTotal(payload.total);
        if (!aborter.signal.aborted) { setLoading(false); setFetchError(null); }
        if (payload.errors?.length) {
          toast.error(
            `Data discrepancy detected:\n${payload.errors.join('\n')}`,
            { id: 'data-discrepancy', duration: 10000 },
          );
        }
        const first = payload.data[0];
        if (first) logger.debug({ stars_diff: first['stars_diff'], stars_diff_6h: (first['stars_diff'] as Record<string, unknown>)?.['6h'] }, 'first row stars_diff');
      })
      .catch((err: Error) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = errMsg(err);
        setFetchError(msg);
        toast.error(`Failed to load rows: ${msg}`, { id: 'fetch-data-rows-error' });
        // Keep loading=true so ↓ indicator stays on; retry forever
        fetchRetryTimerRef.current = setTimeout(() => {
          fetchRetryTimerRef.current = null;
          setRetryKey((k) => k + 1);
        }, 1_000);
      });

    return () => {
      aborter.abort();
      if (fetchRetryTimerRef.current !== null) { clearTimeout(fetchRetryTimerRef.current); fetchRetryTimerRef.current = null; }
    };
  }, [page, sort, filters, api, tableId, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch custom columns ───────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return;
    let active = true;
    api.fetchCustomColumns(tableId)
      .then((cols) => {
        if (!active) return;
        logger.debug({ count: cols.length, stars_diff: cols.filter((c) => c.id.startsWith('gh_stars_diff')) }, 'custom columns loaded');
        logger.debug(cols.reduce<Record<string, unknown>>((acc, c) => { acc[c.id] = { title: c.title, source_path: c.source_path, parent_ids: c.parent_ids, types: c.types }; return acc; }, {}), 'column metadata');
        setCustomColumns(cols);
      })
      .catch((err: unknown) => {
        if (!active) return;
        toast.error(`Failed to load custom columns: ${errMsg(err)}`, { id: 'fetch-custom-cols-error' });
        // Retry forever
        customColsRetryTimerRef.current = setTimeout(() => {
          customColsRetryTimerRef.current = null;
          setCustomColsRetryKey((k) => k + 1);
        }, 1_000);
      });
    return () => {
      active = false;
      if (customColsRetryTimerRef.current !== null) { clearTimeout(customColsRetryTimerRef.current); customColsRetryTimerRef.current = null; }
    };
  }, [api, tableId, customColsRetryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset column menu modes when it closes ─────────────────────────────────
  useEffect(() => { setHeaderMenuMode('menu'); }, [openMenuColumn]);

  // ── Column geometry ────────────────────────────────────────────────────────
  const columns = useMemo<Column[]>(() => {
    const result = customColumns.length > 0
      ? columnsFromMetadata(customColumns, rows[0])
      : (rows[0] ? deriveColumns(rows[0]) : []);
    let flat = result;
    if (columnOrder.length > 0) {
      const map = new Map(result.map((c) => [c.id, c]));
      const ordered: Column[] = [];
      const seen = new Set<string>();
      for (const id of columnOrder) {
        const col = map.get(id);
        if (col) { ordered.push(col); seen.add(id); }
      }
      for (const col of result) { if (!seen.has(col.id)) ordered.push(col); }
      flat = ordered;
    }
    flat = [...flat.filter((col) => col.isFrozen), ...flat.filter((col) => !col.isFrozen)];
    return applyColumnGroups(flat, columnGroups);
  }, [rows, customColumns, columnOrder, columnGroups]);

  useEffect(() => {
    if (columns.length === 0) return;
    setColumnWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const col of columns) {
        if (!(col.id in next)) { next[col.id] = col.width ?? 120; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [columns]);

  // ── Sync filter draft when column menu opens ───────────────────────────────
  useEffect(() => {
    if (!openMenuColumn) return;
    const col = allLeafColumns.find((c) => c.id === openMenuColumn) ?? { id: openMenuColumn };
    const param = colFilterParam(col);
    if (param) setFilterDraft((prev) => ({ ...prev, [openMenuColumn]: filters[param] ?? '' }));
  }, [openMenuColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);

  const allLeafColumns = useMemo(() => getLeafColumns(columns), [columns]);
  const visibleLeafColumns = useMemo(
    () => allLeafColumns.filter((c) => !hiddenSet.has(c.id)),
    [allLeafColumns, hiddenSet],
  );
  const frozenLeftByColumn = useMemo(() => {
    let left = 0;
    const map = new Map<string, number>();
    for (const col of visibleLeafColumns) {
      if (!col.isFrozen) continue;
      map.set(col.id, left);
      left += columnWidths[col.id] ?? col.width ?? 120;
    }
    return map;
  }, [visibleLeafColumns, columnWidths]);
  const headerRows = useMemo(
    () => buildHeaderRows(columns, getColumnDepth(columns), hiddenSet),
    [columns, hiddenSet],
  );
  const resizerTargetByColumn = useMemo(() => {
    const map = new Map<string, string>();
    function traverse(col: Column) {
      const leaves = getVisibleLeafColumns(col, hiddenSet);
      if (leaves.length > 0) map.set(col.id, leaves[leaves.length - 1].id);
      col.subColumns?.forEach(traverse);
    }
    columns.forEach(traverse);
    return map;
  }, [columns, hiddenSet]);

  const leafHeaderKey = useMemo(() => {
    const map = new Map<string, string>();
    headerRows.forEach((row) =>
      row.forEach(({ column, depth }) => {
        if (!column.subColumns?.length && !map.has(column.id))
          map.set(column.id, `header:${column.id}:${depth}`);
      }),
    );
    return map;
  }, [headerRows]);

  const {
    selectedKeys,
    cursorPos,
    selectedSet, selectedRows, selectedCols,
    selectKey: selectKeyHook, moveCursor,
    cursorToKey: cursorToKeyFn,
  } = useTableSelection(visibleLeafColumns, leafHeaderKey, rows.length);

  const selectKey = useCallback((key: string, multi: boolean, shift?: boolean) => {
    selectKeyHook(key, multi, shift);
    setAddColFocused(false);
    wrapperRef.current?.focus();
  }, [selectKeyHook]);

  const compiledExprs = useMemo(() => {
    const map = new Map<string, (row: DataRow) => unknown>();
    for (const cc of customColumns) {
      if (cc.expression?.trim()) {
        try {
          // eslint-disable-next-line no-new-func
          map.set(resolveColumnId(cc), new Function('row', `"use strict"; return (${cc.expression})`) as (row: DataRow) => unknown);
        } catch { /* invalid expression */ }
      }
    }
    return map;
  }, [customColumns]);

  // Lookup maps for column metadata
  const customColByColumnId = useMemo(() => new Map(customColumns.map((cc) => [resolveColumnId(cc), cc])), [customColumns]);

  const isCellEditable = useCallback((colId: string): boolean => {
    if (compiledExprs.has(colId)) return false; // computed — not user-editable
    const cc = customColByColumnId.get(colId);
    return cc ? !isColumnReadOnly(cc) : true; // no metadata yet → fallback columns are editable
  }, [compiledExprs, customColByColumnId]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) return; // let the input handle keys

    if (e.key === 'Enter') {
      if (addColFocused) {
        e.preventDefault();
        const lastCol = allLeafColumns[allLeafColumns.length - 1];
        setAddColAfter(lastCol?.id ?? '');
        setOpenMenuColumn(null);
        setMenuAnchor(null);
        setAddColFocused(false);
        return;
      }
      if (cursorPos && cursorPos.row === rows.length) {
        e.preventDefault();
        setShowAddRowDialog(true);
        return;
      }
      if (cursorPos && cursorPos.row >= 0) {
        const col = visibleLeafColumns[cursorPos.col];
        const row = rows[cursorPos.row];
        if (col && row && isCellEditable(col.id)) {
          e.preventDefault();
          const rowId = String(row['id'] ?? '');
          const strVal = row[col.id] == null ? '' : String(row[col.id]);
          setEditingCell({ rowIndex: cursorPos.row, rowId, colId: col.id, value: strVal });
        }
      }
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();

    if (addColFocused) {
      if (e.key === 'ArrowLeft') {
        setAddColFocused(false);
        return;
      }
      // ArrowUp/Down: exit virtual col and move normally
      setAddColFocused(false);
      moveCursor(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
      return;
    }

    if (e.key === 'ArrowRight' && cursorPos && cursorPos.col === visibleLeafColumns.length - 1) {
      setAddColFocused(true);
      return;
    }

    moveCursor(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
  };

  const commitEdit = useCallback(() => {
    if (!editingCell || !cellApiRef.current) return;
    const { rowIndex, rowId, colId, value } = editingCell;
    setEditingCell(null);
    // Optimistic local update
    setRows((prev) => prev.map((r, i) => i === rowIndex ? { ...r, [colId]: value } : r));
    recordChange(`Edit cell [${colId}]`);
    cellApiRef.current.upsertCellValue(rowId, colId, value);
  }, [editingCell, recordChange]);

  const cancelEdit = useCallback(() => setEditingCell(null), []);

  useEffect(() => {
    if (!cursorPos) return;
    const key = cursorToKeyFn(cursorPos);
    if (!key) return;
    const el = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // Update URL hash: #rowId--colId
    if (key.startsWith('cell:')) {
      const parts = key.split(':');
      const ri = parseInt(parts[1], 10);
      const colId = parts.slice(2).join(':');
      const row = rows[ri];
      if (row) {
        const rowId = String(row['id'] ?? '');
        history.replaceState(null, '', `#${encodeURIComponent(rowId)}--${encodeURIComponent(colId)}`);
      }
    }
  }, [cursorPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // On rows load, jump to the cell referenced in the URL hash.
  useEffect(() => {
    if (rows.length === 0 || typeof window === 'undefined') return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const sepIdx = hash.indexOf('--');
    if (sepIdx < 0) return;
    const targetRowId = decodeURIComponent(hash.slice(0, sepIdx));
    const targetColId = decodeURIComponent(hash.slice(sepIdx + 2));
    const ri = rows.findIndex((r) => String(r['id'] ?? '') === targetRowId);
    if (ri < 0) return;
    const bodyKey = `cell:${ri}:${targetColId}`;
    const el = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(bodyKey)}"]`);
    el?.scrollIntoView({ block: 'center', inline: 'nearest' });
    selectKey(bodyKey, false);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (col: string, dir: 'asc' | 'desc') => {
    const colType = allLeafColumns.find((c) => c.id === col)?.types?.[0];
    setSort({ col, dir, colType });
    setPage(1);
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  };

  const applyFilter = (colId: string) => {
    const col = allLeafColumns.find((c) => c.id === colId) ?? { id: colId };
    const param = colFilterParam(col);
    if (!param) return;
    const value = (filterDraft[colId] ?? '').trim();
    setFilters((prev) => {
      if (!value) { const { [param]: _, ...rest } = prev; return rest; }
      return { ...prev, [param]: value };
    });
    setPage(1);
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  };

  const clearColFilter = (colId: string) => {
    const col = allLeafColumns.find((c) => c.id === colId) ?? { id: colId };
    const param = colFilterParam(col);
    if (!param) return;
    setFilters((prev) => { const { [param]: _, ...rest } = prev; return rest; });
    setFilterDraft((prev) => { const { [colId]: _, ...rest } = prev; return rest; });
    setPage(1);
  };

  const hideColumns = useCallback((ids: string[]) => {
    if (!api) return;
    setHiddenColumns((prev) => {
      const toAdd = ids.filter((id) => !prev.includes(id));
      toAdd.forEach((id) => api.addHiddenColumn(id));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  }, [api]);

  const showColumn = (id: string) => {
    setHiddenColumns((prev) => prev.filter((c) => c !== id));
    api?.removeHiddenColumn(id);
  };
  const showAllColumns = () => {
    hiddenColumns.forEach((id) => api?.removeHiddenColumn(id));
    setHiddenColumns([]);
    setOpenMenuColumn(null);
  };

  const hideRows = useCallback((rowIds: string[]) => {
    if (!api) return;
    rowIds.forEach((id) => api.addHiddenRow(id));
    setHiddenRowIds((prev) => new Set([...prev, ...rowIds]));
    setRows((prev) => prev.filter((r) => !rowIds.includes(String(r['id'] ?? ''))));
  }, [api]);

  const handleResizerPointerDown = (event: React.PointerEvent<HTMLDivElement>, columnId: string) => {
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = { id: columnId, startX: event.clientX, startWidth: columnWidths[columnId] ?? 120 };
    const onMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      const { id, startX, startWidth } = resizingRef.current;
      setColumnWidths((prev) => ({ ...prev, [id]: Math.max(startWidth + e.clientX - startX, 8) }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  // Close column menu on outside click
  useEffect(() => {
    if (!openMenuColumn) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.context-menu') && !t.closest('.column-action-button')) {
        setOpenMenuColumn(null);
        setMenuAnchor(null);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [openMenuColumn]);

  // Close cell menu on outside click
  useEffect(() => {
    if (!cellMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.context-menu')) setCellMenu(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [cellMenu]);

  // All stable column ids currently visible, used for duplicate-ID validation.
  const existingColNames = useMemo<Set<string>>(() => new Set([
    ...allLeafColumns.map((c) => c.id),
    ...customColumns.map((cc) => cc.id),
  ]), [allLeafColumns, customColumns]);

  const handleDialogConfirm = useCallback((afterColId: string, payload: import('./AddColumnDialog').AddColumnPayload) => {
    if (!api) return;
    setAddColAfter(null);
    setOpenMenuColumn(null);
    setMenuAnchor(null);
    const derivedName = payload.title.trim();
    const id = payload.customId ?? nanoid();
    const positionAfter = afterColId || null;
    const col: ApiCustomColumn = {
      id,
      title: payload.title.trim(),
      description: payload.description,
      expression: payload.expression,
      position_after: positionAfter,
      read_only: false,
      readOnly: false,
      is_frozen: false,
      types: ['text'],
    };
    setCustomColumns((prev) => [...prev, col]);
    recordChange(`Create column "${col.title ?? col.id}"`);
    api.createCustomColumn(tableId, { title: col.title, description: col.description, expression: col.expression, position_after: col.position_after }, id);
  }, [api, recordChange, tableId]);

  const toggleColumnFrozen = useCallback((colId: string, isFrozen: boolean) => {
    const col = allLeafColumns.find((c) => c.id === colId);
    const customId = col?.customColumnId ?? customColByColumnId.get(colId)?.id;
    if (!customId || !cellApiRef.current) return;
    setCustomColumns((prev) => prev.map((cc) => cc.id === customId ? { ...cc, is_frozen: isFrozen } : cc));
    recordChange(`${isFrozen ? 'Freeze' : 'Unfreeze'} column "${col?.label ?? colId}"`);
    cellApiRef.current.setColumnFrozen(tableId, customId, isFrozen)
      .then((saved) => setCustomColumns((prev) => prev.map((cc) => cc.id === saved.id ? saved : cc)))
      .catch((err: unknown) => toast.error(`Failed to update column: ${errMsg(err)}`));
  }, [allLeafColumns, customColByColumnId, recordChange, tableId]);

  const saveColumnProperties = useCallback((columnId: string, payload: ColumnPropertiesPayload) => {
    if (!cellApiRef.current) return;
    cellApiRef.current.setColumnSourcePath(tableId, columnId, payload.source_path)
      .then((saved) => setCustomColumns((prev) => prev.map((cc) => cc.id === saved.id ? saved : cc)))
      .catch((err: unknown) => toast.error(`Failed to update column: ${errMsg(err)}`));
  }, [tableId]);

  const deleteCustomColumn = useCallback((colId: string) => {
    const colMeta = customColByColumnId.get(colId);
    if (!colMeta || isColumnReadOnly(colMeta)) return;
    // Count associated remarks and flags from local state, then show confirmation.
    const suffix = `:${colId}`;
    const noteIds    = new Set<string>();
    const commentIds = new Set<string>();
    for (const [key, remarks] of Object.entries(cellRemarks)) {
      if (key.endsWith(suffix) || key === colId) {
        for (const r of remarks) {
          if (r.kind === 'note')    noteIds.add(r.id);
          else if (r.kind === 'comment') commentIds.add(r.id);
        }
      }
    }
    let flagCount = 0;
    for (const key of Object.keys(cellFlags)) {
      if (key.endsWith(suffix) || key === `header:${colId}`) flagCount++;
    }
    const label = allLeafColumns.find((c) => c.id === colId)?.label ?? colId;
    setOpenMenuColumn(null);
    setMenuAnchor(null);
    setPendingDeleteCol({ colId, label, notes: noteIds.size, comments: commentIds.size, flags: flagCount });
  }, [customColByColumnId, cellRemarks, cellFlags, allLeafColumns]);

  const confirmDeleteCustomColumn = useCallback(() => {
    if (!pendingDeleteCol || !api) return;
    const { colId } = pendingDeleteCol;
    const colMeta = customColByColumnId.get(colId);
    if (!colMeta || isColumnReadOnly(colMeta)) return;
    recordChange(`Delete column "${pendingDeleteCol.label}"`);
    api.deleteCustomColumn(colMeta.id);
    setCustomColumns((prev) => prev.filter((c) => c.id !== colMeta.id));
    setHiddenColumns((prev) => prev.filter((c) => c !== colId));
    setPendingDeleteCol(null);
  }, [api, customColByColumnId, pendingDeleteCol]);

  const handleAddRowConfirm = useCallback((payload: AddRowPayload) => {
    if (!cellApiRef.current) return;
    setRows((prev) => [...prev, { id: payload.id, title: payload.title }]);
    setTotal((t) => t + 1);
    recordChange(`Add row "${payload.title}"`);
    cellApiRef.current.createRow(tableId, payload.id, { title: payload.title });
    setShowAddRowDialog(false);
  }, [recordChange, tableId]);

  const handleFlagsChange = useCallback((toSet: Record<string, string>, toDelete: string[]) => {
    if (!api) return;
    setCellFlags((prev) => {
      const next = { ...prev, ...toSet };
      toDelete.forEach((k) => delete next[k]);
      return next;
    });
    Object.entries(toSet).forEach(([key, color]) => { recordChange(`Set ${color} flag`); api.upsertFlag(key, color); });
    toDelete.forEach((key) => { recordChange('Remove flag'); api.deleteFlag(key); });
  }, [api]);

  const saveRemark = useCallback((
    targets: RemarkTarget[],
    kind: 'note' | 'comment',
    body: string,
    existingId: string | null,
  ) => {
    if (!api) return;
    if (!body.trim()) {
      if (existingId) {
        api.deleteRemark(existingId);
        setCellRemarks((prev) => {
          const next = { ...prev };
          for (const t of targets) {
            const key = `${t.row_id}:${t.column_id}`;
            const filtered = (next[key] ?? []).filter((r) => r.id !== existingId);
            if (filtered.length > 0) next[key] = filtered; else delete next[key];
          }
          return next;
        });
      }
      return;
    }
    const rid = existingId ?? nanoid();
    recordChange(`Save ${kind}`);
    // Optimistic update
    const optimistic: ApiRemark = { id: rid, body, kind, is_private: false, resolved_at: null, targets };
    setCellRemarks((prev) => {
      const next = { ...prev };
      for (const t of targets) {
        const key = `${t.row_id}:${t.column_id}`;
        const others = (next[key] ?? []).filter((r) => r.id !== rid);
        next[key] = [...others, optimistic];
      }
      return next;
    });
    api.upsertRemark(rid, kind, body, targets);
  }, [api]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isDownloading = loading || bootstrapping;

  // Always show the real queue contents so the list matches the badge count.
  // pendingChanges is an in-session activity log; it only fills gaps for items
  // that somehow have no queue entry (e.g. sent so fast they left the queue
  // before the summary was fetched).
  const queueChanges = [...cellQueueSummary, ...syncQueueSummary];
  const displayChanges: PendingChange[] = queueChanges.length > 0
    ? queueChanges
    : pendingChanges;

  return (
    <>
      <SyncIndicator pendingUploads={pendingUploads} isDownloading={isDownloading} pendingChanges={displayChanges} />
      {rows.length === 0 && columns.length === 0 ? (
        fetchError
          ? <div style={{ padding: '1rem', color: 'red' }}>Error: {fetchError}</div>
          : loading
            ? <div style={{ padding: '1rem', opacity: 0.6 }}>Loading…</div>
            : <div className="table-empty-state">No rows yet. Use the column menu to add a column.</div>
      ) : (
      <>
      <div className="tree-table-container">
        {loading && (
          <div className="table-loading-overlay">
            <span>Loading…</span>
          </div>
        )}
        <div
          ref={wrapperRef}
          className="tree-table-wrap"
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          style={{ outline: 'none' }}
        >
          <table className="tree-table">
            <colgroup>
              {visibleLeafColumns.map((col) => (
                <col key={col.id} style={{ width: `${columnWidths[col.id] ?? 120}px`, minWidth: '8px' }} />
              ))}
              <col key="__add-col__" style={{ width: '48px', minWidth: '48px' }} />
            </colgroup>
            <thead>
              {headerRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map(({ column, colSpan, rowSpan, depth }: HeaderCell) => {
                    const headerKey = `header:${column.id}:${depth}`;
                    const isHeaderSelected = selectedSet.has(headerKey);
                    const resizerTargetId = resizerTargetByColumn.get(column.id);
                    const isLeaf = !column.subColumns?.length;
                    const leafIdsToHide = (isLeaf
                      ? (hiddenSet.has(column.id) ? [] : [column.id])
                      : getVisibleLeafColumns(column, hiddenSet).map((c) => c.id)
                    ).filter((id) => !allLeafColumns.find((c) => c.id === id)?.isFrozen);
                    const selectedHeaderLeafIds = selectedKeys
                      .filter((k) => k.startsWith('header:'))
                      .map((k) => k.split(':')[1])
                      .filter((id) => !hiddenSet.has(id) && !allLeafColumns.find((c) => c.id === id)?.isFrozen && allLeafColumns.some((c) => c.id === id));
                    const allColsToHide = [...new Set([...leafIdsToHide, ...selectedHeaderLeafIds])];
                    const showMenu = leafIdsToHide.length > 0 || isLeaf;
                    const frozenLeft = isLeaf ? frozenLeftByColumn.get(column.id) : undefined;
                    const isSticky = frozenLeft !== undefined;
                    const colHasFilter = () => {
                      const p = colFilterParam(column);
                      return !!p && !!filters[p];
                    };

                    return (
                      <th
                        key={headerKey}
                        colSpan={colSpan}
                        rowSpan={rowSpan}
                        data-key={headerKey}
                        draggable={isLeaf && !column.isFrozen}
                        onDragStart={(e) => {
                          dragColRef.current = column.id;
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          const from = dragColRef.current;
                          if (!from || from === column.id || column.isFrozen) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (!isLeaf) {
                            setDragGroupTarget(column.id);
                            setDragOverCol(null);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const relX = (e.clientX - rect.left) / rect.width;
                            if (relX > 0.3 && relX < 0.7) {
                              setDragGroupTarget(column.id);
                              setDragOverCol(null);
                            } else {
                              setDragOverCol(column.id);
                              setDragGroupTarget(null);
                            }
                          }
                        }}
                        onDragLeave={() => {
                          setDragOverCol((prev) => prev === column.id ? null : prev);
                          setDragGroupTarget((prev) => prev === column.id ? null : prev);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = dragColRef.current;
                          dragColRef.current = null;
                          setDragOverCol(null);
                          setDragGroupTarget(null);
                          if (!from || from === column.id || column.isFrozen) return;
                          if (!isLeaf) {
                            addToGroup(column.id, from);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const relX = (e.clientX - rect.left) / rect.width;
                            if (relX > 0.3 && relX < 0.7) {
                              const fromLabel = allLeafColumns.find((c) => c.id === from)?.label ?? from;
                              addColumnGroup(`${fromLabel} / ${column.label}`, [from, column.id]);
                            } else {
                              reorderColumns(from, column.id, allLeafColumns.map((c) => c.id));
                            }
                          }
                        }}
                        onDragEnd={() => { dragColRef.current = null; setDragOverCol(null); setDragGroupTarget(null); }}
                        className={[
                          isHeaderSelected ? 'header-selected' : (isLeaf && selectedCols.has(column.id) ? 'col-highlight' : ''),
                          isSticky ? 'sticky-col' : '',
                          cellFlags[`header:${column.id}`] ? `flag-${cellFlags[`header:${column.id}`]}` : '',
                          dragOverCol === column.id ? 'col-drag-over' : '',
                          dragGroupTarget === column.id ? 'col-drag-group' : '',
                        ].filter(Boolean).join(' ') || undefined}
                        style={isSticky ? { left: frozenLeft } : undefined}
                        onClick={(e) => selectKey(headerKey, e.metaKey || e.ctrlKey, e.shiftKey)}
                        onContextMenu={(e) => {
                          if (!showMenu) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuAnchor({ top: e.clientY + window.scrollY, left: e.clientX + window.scrollX });
                          setOpenMenuColumn(column.id);
                        }}
                      >
                        <div className="column-group">
                          {!isLeaf && column.id in editingGroupLabel ? (
                            <input
                              className="group-label-editor"
                              autoFocus
                              value={editingGroupLabel[column.id] ?? column.label}
                              onChange={(e) => setEditingGroupLabel((prev) => ({ ...prev, [column.id]: e.target.value }))}
                              onBlur={() => {
                                const newLabel = editingGroupLabel[column.id];
                                if (newLabel !== undefined) updateGroupLabel(column.id, newLabel);
                                setEditingGroupLabel((prev) => { const { [column.id]: _, ...rest } = prev; return rest; });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') setEditingGroupLabel((prev) => { const { [column.id]: _, ...rest } = prev; return rest; });
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="col-label"
                              onDoubleClick={!isLeaf ? (e) => {
                                e.stopPropagation();
                                setEditingGroupLabel((prev) => ({ ...prev, [column.id]: column.label }));
                              } : undefined}
                            >
                              {column.label}
                              {sort.col === column.id && (
                                <span className="sort-indicator">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                              {isLeaf && colHasFilter() && (
                                <span className="filter-indicator" title="Filtered">●</span>
                              )}
                            </span>
                          )}
                          {showMenu && (
                            <span className="header-actions">
                              <button
                                type="button"
                                className="column-action-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (openMenuColumn === column.id) {
                                    setOpenMenuColumn(null);
                                    setMenuAnchor(null);
                                  } else {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setMenuAnchor({ top: rect.bottom + window.scrollY + 6, left: rect.right + window.scrollX });
                                    setOpenMenuColumn(column.id);
                                  }
                                }}
                                aria-label={`Column actions for ${column.label}`}
                              >
                                ☰
                              </button>
                              {openMenuColumn === column.id && menuAnchor && (
                                <ContextMenu
                                  kind="header"
                                  column={column}
                                  anchor={menuAnchor}
                                  mode={headerMenuMode}
                                  isLeaf={isLeaf}
                                  allColsToHide={allColsToHide}
                                  sort={sort}
                                  filters={filters}
                                  filterDraft={filterDraft}
                                  cellFlags={cellFlags}
                                  cellRemarks={cellRemarks}
                                  onFlagsChange={handleFlagsChange}
                                  onSaveRemark={saveRemark}
                                  setFilterDraft={setFilterDraft}
                                  draftText={draftText}
                                  setDraftText={setDraftText}
                                  onSetMode={setHeaderMenuMode}
                                  onSort={handleSort}
                                  onApplyFilter={applyFilter}
                                  onClearFilter={clearColFilter}
                                  onHide={hideColumns}
                                  onAddColClick={(colId) => { setAddColAfter(colId || null); setOpenMenuColumn(null); setMenuAnchor(null); }}
                                  onToggleFrozen={toggleColumnFrozen}
                                  onDeleteCol={deleteCustomColumn}
                                  onUngroup={!isLeaf ? (groupId) => { removeColumnGroup(groupId); setOpenMenuColumn(null); setMenuAnchor(null); } : undefined}
                                  onProperties={(colId) => {
                                    const cc = customColumns.find((c) => c.id === colId) ?? customColByColumnId.get(colId);
                                    if (cc) setPropertiesCol(cc);
                                    setOpenMenuColumn(null); setMenuAnchor(null);
                                  }}
                                  onClose={() => { setOpenMenuColumn(null); setMenuAnchor(null); }}
                                />
                              )}
                            </span>
                          )}
                        </div>
                        {resizerTargetId && (
                          <div
                            className="resizer"
                            onPointerDown={(e) => { e.stopPropagation(); handleResizerPointerDown(e, resizerTargetId); }}
                          />
                        )}
                      </th>
                    );
                  })}
                  {rowIndex === 0 && (
                    <th
                      key="__add-col__"
                      rowSpan={headerRows.length}
                      className={`add-col-th${addColFocused ? ' add-col-th--focused' : ''}`}
                    >
                      <button
                        type="button"
                        className="add-col-button"
                        title="Add column"
                        onClick={() => {
                          const lastCol = allLeafColumns[allLeafColumns.length - 1];
                          setAddColAfter(lastCol?.id ?? '');
                          setOpenMenuColumn(null);
                          setMenuAnchor(null);
                        }}
                      >+</button>
                    </th>
                  )}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row: DataRow, rowIndex: number) => {
                const rowId = String(row['id'] ?? '');
                if (hiddenRowIds.has(rowId)) return null;
                return (
                  <tr
                    key={rowIndex}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {visibleLeafColumns.map((col: Column) => {
                      const bodyKey = `cell:${rowIndex}:${col.id}`;
                      const noteKey = `${rowId}:${col.id}`;
                      return (
                        <td
                          key={bodyKey}
                          data-key={bodyKey}
                          className={[
                            selectedSet.has(bodyKey)
                              ? 'cell-selected'
                              : [
                                  selectedRows.has(String(rowIndex)) ? 'row-highlight' : '',
                                  selectedCols.has(col.id) ? 'col-highlight' : '',
                                ].filter(Boolean).join(' '),
                            col.isFrozen ? 'sticky-col' : '',
                            cellFlags[noteKey] ? `flag-${cellFlags[noteKey]}` : '',
                          ].filter(Boolean).join(' ') || undefined}
                          style={col.isFrozen ? { left: frozenLeftByColumn.get(col.id) ?? 0 } : undefined}
                          onClick={(e) => { selectKey(bodyKey, e.metaKey || e.ctrlKey, e.shiftKey); onRowClick?.(rowId); }}
                          onDoubleClick={(e) => {
                            if (!isCellEditable(col.id)) return;
                            e.stopPropagation();
                            const rawVal = row[col.id];
                            const strVal = rawVal == null ? '' : String(rawVal);
                            setEditingCell({ rowIndex, rowId, colId: col.id, value: strVal });
                          }}
                          onContextMenu={(e) => {
                            if (editingCell?.rowIndex === rowIndex && editingCell?.colId === col.id) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const isSelected = selectedSet.has(bodyKey);
                            const selBodyKeys = selectedKeys.filter((k) => k.startsWith('cell:'));
                            const targets: CellTarget[] = (isSelected && selBodyKeys.length > 1)
                              ? selBodyKeys.map((k) => {
                                  const p = k.split(':');
                                  return {
                                    rowId: String(rows[parseInt(p[1], 10)]?.['id'] ?? ''),
                                    colId: p[2],
                                  };
                                })
                              : [{ rowId, colId: col.id }];
                            setCellMenu({ anchor: { top: e.clientY + window.scrollY, left: e.clientX + window.scrollX }, targets });
                            setCellMenuMode('menu');
                            setDraftText('');
                          }}
                        >
                          {editingCell?.rowIndex === rowIndex && editingCell?.colId === col.id ? (
                            <input
                              className="cell-editor"
                              autoFocus
                              value={editingCell.value}
                              onChange={(e) => setEditingCell((prev) => prev ? { ...prev, value: e.target.value } : null)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); wrapperRef.current?.focus(); }
                                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); wrapperRef.current?.focus(); }
                              }}
                            />
                          ) : (
                            <CellContent
                              row={row}
                              colId={col.id}
                              compiledExpr={compiledExprs.get(col.id)}
                              hasNote={cellRemarks[noteKey]?.some((r) => r.kind === 'note') ?? false}
                              hasComment={cellRemarks[noteKey]?.some((r) => r.kind === 'comment') ?? false}
                            />
                          )}
                          <div
                            className="resizer"
                            onPointerDown={(e) => { e.stopPropagation(); handleResizerPointerDown(e, col.id); }}
                          />
                        </td>
                      );
                    })}
                    <td key="__add-col__" className="add-col-td" />
                  </tr>
                );
              })}
              <tr
                className="add-row-tr"
                onDoubleClick={() => setShowAddRowDialog(true)}
              >
                {visibleLeafColumns.map((col, colIdx) => {
                  const addRowKey = `add-row:${col.id}`;
                  const isFocused = selectedSet.has(addRowKey);
                  return (
                    <td
                      key={col.id}
                      className={[
                        'add-row-td',
                        isFocused ? 'add-row-td--focused' : '',
                        col.isFrozen ? 'sticky-col' : '',
                      ].filter(Boolean).join(' ')}
                      style={col.isFrozen ? { left: frozenLeftByColumn.get(col.id) ?? 0 } : undefined}
                      onClick={(e) => selectKey(addRowKey, e.metaKey || e.ctrlKey)}
                    >
                      {colIdx === 0 ? '+ Add row' : ''}
                    </td>
                  );
                })}
                <td className="add-row-td add-col-td" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="table-note">
        <span>{total.toLocaleString()} rows — page {page} of {totalPages}</span>
        <span style={{ marginLeft: '1rem' }}>
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</button>
          {' '}
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</button>
        </span>
        {hiddenRowIds.size > 0 && (
          <span style={{ marginLeft: '1rem', color: '#64748b', fontSize: '0.81rem' }}>
            {hiddenRowIds.size} row{hiddenRowIds.size !== 1 ? 's' : ''} hidden
          </span>
        )}
        {hiddenColumns.length > 0 && (
          <span className="hidden-columns-controls">
            Hidden:{' '}
            {hiddenColumns.map((id: string) => {
              const col = allLeafColumns.find((c: Column) => c.id === id);
              return (
                <button key={id} type="button" className="show-column-button" onClick={() => showColumn(id)}>
                  {col?.label ?? id}
                </button>
              );
            })}
            <button type="button" className="show-all-button" onClick={showAllColumns}>Show all</button>
          </span>
        )}
      </div>
      </>
      )}
      {cellMenu && (
        <ContextMenu
          kind="cell"
          anchor={cellMenu.anchor}
          targets={cellMenu.targets}
          mode={cellMenuMode}
          draftText={draftText}
          cellFlags={cellFlags}
          cellRemarks={cellRemarks}
          onFlagsChange={handleFlagsChange}
          onSaveRemark={saveRemark}
          setDraftText={setDraftText}
          onSetMode={setCellMenuMode}
          onHideCols={hideColumns}
          onHideRows={hideRows}
          onClose={() => setCellMenu(null)}
        />
      )}
      {addColAfter !== null && (
        <AddColumnDialog
          afterColId={addColAfter}
          existingNames={existingColNames}
          onConfirm={handleDialogConfirm}
          onClose={() => setAddColAfter(null)}
        />
      )}
      {pendingDeleteCol && (
        <ColumnDeleteConfirmDialog
          columnLabel={pendingDeleteCol.label}
          notesCount={pendingDeleteCol.notes}
          commentsCount={pendingDeleteCol.comments}
          flagsCount={pendingDeleteCol.flags}
          onConfirm={confirmDeleteCustomColumn}
          onCancel={() => setPendingDeleteCol(null)}
        />
      )}
      {showAddRowDialog && (
        <AddRowDialog
          onConfirm={handleAddRowConfirm}
          onClose={() => setShowAddRowDialog(false)}
        />
      )}
      {propertiesCol && (
        <ColumnPropertiesDialog
          column={propertiesCol}
          onSave={saveColumnProperties}
          onClose={() => setPropertiesCol(null)}
        />
      )}
    </>
  );
}
