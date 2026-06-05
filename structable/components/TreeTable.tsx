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
import AiFillDialog from './AiFillDialog';
import CellContent from './CellContent';
import SyncIndicator from './SyncIndicator';
import RowClassEditor from './RowClassEditor';
import { colFilterParam, type ColType } from '../utils/columnFilters';
import logger from '../utils/logger';

import type { ApiCustomColumn, ApiRemark, CellTarget, PagedResponse, RemarkTarget, DataRow, RowClass } from '../types/table';

// ── Constants ──────────────────────────────────────────────────────────────────

const ADD_COL_VIRTUAL_ID = '__add-col__';
const ADD_COL_HEADER_KEY = `header:${ADD_COL_VIRTUAL_ID}:0`;
const ADD_COL_VIRTUAL_COLUMN = { id: ADD_COL_VIRTUAL_ID, label: '+' };

const CLASSES_COL_ID = 'classes';

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
  sourcePath?: string[] | null;
  subColumns?: Column[];
};

const CLASSES_COLUMN: Column = {
  id: CLASSES_COL_ID,
  label: 'Classes',
  width: 160,
  minWidth: 120,
  readOnly: true,
  types: ['jsonb'],
};

type HeaderCell = { column: Column; colSpan: number; rowSpan: number; depth: number };

// ── Utility functions ──────────────────────────────────────────────────────────

function labelFor(key: string): string {
  if (key === 'stars_diff') return 'Stars diff';
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function columnLabel(cc: ApiCustomColumn): string {
  const title = cc.title?.trim();
  return title && title.length > 0 ? title : labelFor(cc.id);
}

function readPath(row: DataRow, path: string[]): unknown {
  let value: unknown = row;
  for (const part of path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** Resolve a column id/source path against a row object. */
export function rowVal(row: DataRow, id: string, sourcePath?: string[] | null): unknown {
  if (sourcePath?.length) return readPath(row, sourcePath);
  if (Object.prototype.hasOwnProperty.call(row, id)) return row[id];
  return undefined;
}

function rowClassIds(row: DataRow | undefined): string[] {
  const value = row?.[CLASSES_COL_ID];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
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
          id: `${key}__${sub}`,
          label: sub,
          width: 70,
          minWidth: 40,
          sourcePath: [key, sub],
        })),
      };
    }
    return { id: key, label: labelFor(key), width: 120, minWidth: 60, isFrozen: key === 'name' };
  });
}

function isColumnReadOnly(cc: ApiCustomColumn): boolean {
  return cc.readOnly ?? cc.read_only ?? !(cc.is_editable ?? true);
}

function insertPositioned(
  list: Column[],
  col: Column,
  positionBefore: string | null | undefined,
  positionAfter: string | null | undefined,
): void {
  const afterIdx = positionAfter
    ? list.findIndex((c) => c.id === positionAfter || c.customColumnId === positionAfter)
    : -1;
  if (afterIdx >= 0) {
    list.splice(afterIdx + 1, 0, col);
    return;
  }
  const beforeIdx = positionBefore
    ? list.findIndex((c) => c.id === positionBefore || c.customColumnId === positionBefore)
    : -1;
  list.splice(beforeIdx >= 0 ? beforeIdx : list.length, 0, col);
}

function columnsFromMetadata(customColumns: ApiCustomColumn[], _rowSample?: DataRow): Column[] {
  const colMap = new Map<string, Column>();
  const syntheticRootIds = new Set<string>();
  for (const cc of customColumns) {
    if (!cc.id) {
      logger.error({ column: cc }, 'custom column metadata missing id');
      continue;
    }
    colMap.set(cc.id, {
      id: cc.id,
      customColumnId: cc.id,
      label: columnLabel(cc),
      width: 150,
      minWidth: 60,
      readOnly: isColumnReadOnly(cc),
      isFrozen: cc.is_frozen ?? false,
      types: cc.types ?? ['text'],
      filterType: (cc.data_types?.[0] as ColType | undefined) ?? null,
      sourcePath: cc.source_path ?? null,
    });
  }

  const root: Column[] = [];
  for (const cc of customColumns) {
    const col = colMap.get(cc.id);
    if (!col) continue;
    const parentId = cc.parent_ids?.length ? cc.parent_ids[cc.parent_ids.length - 1] : null;
    let parentCol = parentId ? colMap.get(parentId) : null;
    if (parentId && !parentCol) {
      parentCol = {
        id: parentId,
        customColumnId: parentId,
        label: labelFor(parentId),
        width: 150,
        minWidth: 60,
        readOnly: true,
        subColumns: [],
      };
      colMap.set(parentId, parentCol);
      syntheticRootIds.add(parentId);
    }
    if (parentCol) {
      if (!parentCol.subColumns) parentCol.subColumns = [];
      insertPositioned(parentCol.subColumns, col, cc.position_before, cc.position_after);
    } else {
      insertPositioned(root, col, cc.position_before, cc.position_after);
    }
  }
  for (const id of syntheticRootIds) {
    const col = colMap.get(id);
    if (col) insertPositioned(root, col, null, null);
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
    setRowClasses([]);
    setClassEditorState(null);
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
      if ('row_class' in ev && ev.row_class.data.table_id === tableId) {
        const cls = ev.row_class.data;
        setRowClasses((prev) => ev.row_class.kind === 1
          ? prev.filter((candidate) => candidate.id !== cls.id)
          : [...prev.filter((candidate) => candidate.id !== cls.id), {
              id: cls.id,
              table_id: cls.table_id,
              name: cls.name,
              color: cls.color || null,
            }],
        );
      }
      if ('many_to_many' in ev && ev.many_to_many.data.table_id === tableId && ev.many_to_many.data.field_id === CLASSES_COL_ID) {
        const assignment = ev.many_to_many.data;
        setRows((prev) => prev.map((row) =>
          String(row['id'] ?? '') === assignment.row_id
            ? { ...row, [CLASSES_COL_ID]: assignment.item_ids }
            : row,
        ));
      }
    });
    return () => sub.unsubscribe();
  }, [api, tableId]);

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

  // ── Row classes ────────────────────────────────────────────────────────────
  const [rowClasses, setRowClasses] = useState<RowClass[]>([]);
  type ClassEditorState = { rowId: string; anchor: { top: number; left: number } };
  const [classEditorState, setClassEditorState] = useState<ClassEditorState | null>(null);
  const [rowClassesRetryKey, setRowClassesRetryKey] = useState(0);
  const rowClassesRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [showAiFill, setShowAiFill] = useState(false);

  // ── Sort & filter ──────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc'; colType?: string }>({ col: 'stars_diff__14d', dir: 'desc' });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});

  // ── Cell remarks (unified notes + comments) ───────────────────────────────
  const [cellRemarks, setCellRemarks] = useState<Record<string, ApiRemark[]>>({});
  const [cellFlags, setCellFlags] = useState<Record<string, string>>({});

  // ── Cell menu state ────────────────────────────────────────────────────────
  const [cellMenu, setCellMenu] = useState<{ anchor: { top: number; left: number }; targets: CellTarget[] } | null>(null);
  const [cellMenuMode, setCellMenuMode] = useState<'menu' | 'note' | 'comment' | 'flag'>('menu');
  const [draftText, setDraftText] = useState('');

  const resizingRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const pendingFocusColRef = useRef<string | null>(null);
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
    const sortColumn = customColumns.find((cc) => cc.id === sort.col);
    const sortType = sortColumn?.data_types?.[0] ?? sort.colType ?? sortColumn?.types?.[0];
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort: sortType ? `${sort.col}:${sort.dir}:${sortType}` : `${sort.col}:${sort.dir}`,
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
  }, [page, sort, filters, api, tableId, retryKey, customColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch row classes ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!api || tableId === 'tables') return;
    let active = true;
    api.fetchRowClasses(tableId)
      .then((classes) => { if (active) setRowClasses(classes); })
      .catch((err: unknown) => {
        if (!active) return;
        toast.error(`Failed to load row classes: ${errMsg(err)}`, { id: 'fetch-row-classes-error' });
        rowClassesRetryTimerRef.current = setTimeout(() => {
          rowClassesRetryTimerRef.current = null;
          setRowClassesRetryKey((key) => key + 1);
        }, 1_000);
      });
    return () => {
      active = false;
      if (rowClassesRetryTimerRef.current !== null) {
        clearTimeout(rowClassesRetryTimerRef.current);
        rowClassesRetryTimerRef.current = null;
      }
    };
  }, [api, tableId, rowClassesRetryKey]);

  // ── Fetch custom columns ───────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return;
    let active = true;
    api.fetchCustomColumns(tableId)
      .then((cols) => {
        if (!active) return;
        logger.debug({ count: cols.length, stars_diff: cols.filter((c) => c.id.startsWith('stars_diff')) }, 'custom columns loaded');
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
    const dataColumns = customColumns.length > 0
      ? columnsFromMetadata(customColumns, rows[0])
      : (rows[0] ? deriveColumns(rows[0]) : []);
    const result = tableId === 'tables'
      ? dataColumns.filter((col) => col.id !== CLASSES_COL_ID)
      : [...dataColumns.filter((col) => col.id !== CLASSES_COL_ID), CLASSES_COLUMN];
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
  }, [rows, customColumns, columnOrder, columnGroups, tableId]);

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
  // After a new column is added, move selection to it on the current row.
  useEffect(() => {
    const colId = pendingFocusColRef.current;
    if (!colId) return;
    const colIdx = visibleLeafColumns.findIndex((c) => c.id === colId);
    if (colIdx < 0) return;
    pendingFocusColRef.current = null;
    const rowIndex = cursorPos && cursorPos.row >= 0 ? cursorPos.row : 0;
    if (rows.length === 0) return;
    const key = `cell:${rowIndex}:${colId}`;
    setSelectedKeys([key]);
    setCursorPos({ row: rowIndex, col: colIdx });
  }, [visibleLeafColumns]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Include the virtual add-column column after all rendered leaf columns.
  const allColumnsForSelection = useMemo(
    () => [...visibleLeafColumns, ADD_COL_VIRTUAL_COLUMN],
    [visibleLeafColumns],
  );
  const leafHeaderKeyWithVirtual = useMemo(
    () => new Map([...leafHeaderKey, [ADD_COL_VIRTUAL_ID, ADD_COL_HEADER_KEY]]),
    [leafHeaderKey],
  );

  const {
    selectedKeys, setSelectedKeys,
    cursorPos, setCursorPos,
    selectedSet, selectedRows, selectedCols,
    addRowIsSelected,
    selectKey: selectKeyHook, moveCursor,
    cursorToKey: cursorToKeyFn,
  } = useTableSelection(allColumnsForSelection, leafHeaderKeyWithVirtual, rows.length);

  const selectKey = useCallback((key: string, multi: boolean, shift?: boolean) => {
    selectKeyHook(key, multi, shift);
    wrapperRef.current?.focus();
  }, [selectKeyHook]);

  const compiledExprs = useMemo(() => {
    const map = new Map<string, (row: DataRow) => unknown>();
    for (const cc of customColumns) {
      if (cc.expression?.trim()) {
        try {
          // eslint-disable-next-line no-new-func
          map.set(cc.id, new Function('row', `"use strict"; return (${cc.expression})`) as (row: DataRow) => unknown);
        } catch { /* invalid expression */ }
      }
    }
    return map;
  }, [customColumns]);

  // Lookup maps for column metadata
  const customColByColumnId = useMemo(() => new Map(customColumns.map((cc) => [cc.id, cc])), [customColumns]);

  const isCellEditable = useCallback((colId: string): boolean => {
    if (colId === CLASSES_COL_ID) return false;
    if (compiledExprs.has(colId)) return false; // computed — not user-editable
    const cc = customColByColumnId.get(colId);
    return cc ? !isColumnReadOnly(cc) : true; // no metadata yet → fallback columns are editable
  }, [compiledExprs, customColByColumnId]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) return; // let the input handle keys

    if (e.key === 'Enter') {
      const selectedColumnId = cursorPos ? allColumnsForSelection[cursorPos.col]?.id : undefined;
      // On the virtual add-column column: open the dialog regardless of row
      if (selectedColumnId === ADD_COL_VIRTUAL_ID) {
        e.preventDefault();
        const lastCol = allLeafColumns[allLeafColumns.length - 1];
        setAddColAfter(lastCol?.id ?? '');
        setOpenMenuColumn(null);
        setMenuAnchor(null);
        return;
      }
      if (selectedColumnId === CLASSES_COL_ID && cursorPos && cursorPos.row >= 0 && cursorPos.row < rows.length) {
        e.preventDefault();
        const rowId = String(rows[cursorPos.row]?.['id'] ?? '');
        const key = `cell:${cursorPos.row}:${CLASSES_COL_ID}`;
        const rect = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`)?.getBoundingClientRect();
        setClassEditorState({
          rowId,
          anchor: { top: rect?.bottom ?? 0, left: rect?.left ?? 0 },
        });
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
          const rawVal = rowVal(row, col.id, col.sourcePath);
          const strVal = rawVal == null ? '' : String(rawVal);
          setEditingCell({ rowIndex: cursorPos.row, rowId, colId: col.id, value: strVal });
        }
      }
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();

    moveCursor(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
  };

  const restoreEditCursor = useCallback((rowIndex: number, colId: string) => {
    const key = `cell:${rowIndex}:${colId}`;
    setSelectedKeys([key]);
    const colIdx = visibleLeafColumns.findIndex((c) => c.id === colId);
    if (colIdx >= 0) setCursorPos({ row: rowIndex, col: colIdx });
  }, [setSelectedKeys, setCursorPos, visibleLeafColumns]);

  const commitEdit = useCallback(() => {
    if (!editingCell || !api) return;
    const { rowIndex, rowId, colId, value } = editingCell;
    setEditingCell(null);
    restoreEditCursor(rowIndex, colId);
    // Optimistic local update
    setRows((prev) => prev.map((r, i) => i === rowIndex ? { ...r, [colId]: value } : r));
    recordChange(`Edit cell [${colId}]`);
    api.upsertCellValue(rowId, colId, value, tableId);
  }, [editingCell, recordChange, api, tableId, restoreEditCursor]);

  const cancelEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, colId } = editingCell;
    setEditingCell(null);
    restoreEditCursor(rowIndex, colId);
  }, [editingCell, restoreEditCursor]);

  const handleClassEditorConfirm = useCallback(async (
    rowId: string,
    selectedIds: string[],
    newClasses: RowClass[],
  ) => {
    if (!api) return;
    setClassEditorState(null);
    setRows((prev) => prev.map((row) =>
      String(row['id'] ?? '') === rowId ? { ...row, [CLASSES_COL_ID]: selectedIds } : row,
    ));
    setRowClasses((prev) => [
      ...prev.filter((existing) => !newClasses.some((created) => created.id === existing.id)),
      ...newClasses,
    ]);
    for (const cls of newClasses) {
      try {
        await api.createRowClass(tableId, cls.id, cls.name, cls.color);
      } catch (err) {
        toast.error(`Failed to create class "${cls.name}": ${errMsg(err)}`);
      }
    }
    try {
      await api.setRowClasses(tableId, rowId, selectedIds);
    } catch (err) {
      toast.error(`Failed to save row classes: ${errMsg(err)}`);
    }
  }, [api, tableId]);

  // Belt-and-suspenders: if selectedKeys was cleared in the same batch as setEditingCell(null)
  // (e.g. by the onClick→dblclick toggle race), restore it in a separate effect batch.
  const prevEditingCellRef = useRef(editingCell);
  useEffect(() => {
    const prev = prevEditingCellRef.current;
    prevEditingCellRef.current = editingCell;
    if (prev && !editingCell) {
      restoreEditCursor(prev.rowIndex, prev.colId);
    }
  }, [editingCell, restoreEditCursor]);

  useEffect(() => {
    if (!cursorPos) return;
    const key = cursorToKeyFn(cursorPos);
    if (!key) return;
    const el = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // Compensate for sticky headers/columns that scrollIntoView doesn't know about.
    const wrap = wrapperRef.current;
    if (el && wrap) {
      const elRect = el.getBoundingClientRect();

      // Vertical: all thead th cells have position:sticky;top:0. With multi-level headers each
      // row stacks at top:0 independently, so take the max bottom across all th cells.
      const allThs = Array.from(wrap.querySelectorAll('thead th'));
      const headerBottom = allThs.reduce((max, th) => Math.max(max, th.getBoundingClientRect().bottom), 0);
      if (elRect.top < headerBottom) {
        wrap.scrollTop -= headerBottom - elRect.top;
      }

      // Horizontal: frozen columns are position:sticky;left:X. Find the rightmost frozen-column
      // right edge in any row (use the first tbody row's sticky cells for a stable measurement).
      const frozenCells = Array.from(wrap.querySelectorAll('tbody tr:first-child td.sticky-col'));
      const frozenRight = frozenCells.reduce((max, td) => Math.max(max, td.getBoundingClientRect().right), 0);
      if (frozenRight > 0 && elRect.left < frozenRight) {
        wrap.scrollLeft -= frozenRight - elRect.left;
      }
    }
    // Update URL hash: #rowId--colId (skip for virtual columns)
    if (key.startsWith('cell:')) {
      const parts = key.split(':');
      const ri = parseInt(parts[1], 10);
      const colId = parts.slice(2).join(':');
      if (colId !== ADD_COL_VIRTUAL_ID) {
        const row = rows[ri];
        if (row) {
          const rowId = String(row['id'] ?? '');
          history.replaceState(null, '', `#${encodeURIComponent(rowId)}--${encodeURIComponent(colId)}`);
        }
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
    const column = allLeafColumns.find((c) => c.id === col);
    const colType = column?.filterType ?? column?.types?.[0];
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
      position_before: null,
      position_after: positionAfter,
      read_only: false,
      readOnly: false,
      is_frozen: false,
      types: ['text'],
    };
    setCustomColumns((prev) => [...prev, col]);
    pendingFocusColRef.current = id;
    recordChange(`Create column "${col.title ?? col.id}"`);
    api.createCustomColumn(tableId, {
      title: col.title,
      description: col.description,
      expression: col.expression,
      position_before: col.position_before,
      position_after: col.position_after,
    }, id);
  }, [api, recordChange, tableId]);

  const toggleColumnFrozen = useCallback((colId: string, isFrozen: boolean) => {
    const col = allLeafColumns.find((c) => c.id === colId);
    const customId = col?.customColumnId ?? customColByColumnId.get(colId)?.id;
    if (!customId || !api) return;
    setCustomColumns((prev) => prev.map((cc) => cc.id === customId ? { ...cc, is_frozen: isFrozen } : cc));
    recordChange(`${isFrozen ? 'Freeze' : 'Unfreeze'} column "${col?.label ?? colId}"`);
    api.setColumnFrozen(tableId, customId, isFrozen)
      .then((saved) => setCustomColumns((prev) => prev.map((cc) => cc.id === saved.id ? saved : cc)))
      .catch((err: unknown) => toast.error(`Failed to update column: ${errMsg(err)}`));
  }, [allLeafColumns, customColByColumnId, recordChange, tableId, api]);

  const saveColumnProperties = useCallback((columnId: string, payload: ColumnPropertiesPayload) => {
    if (!api) return;
    const patch: { source_path?: string[] | null; title?: string | null } = {
      source_path: payload.source_path,
    };
    if (payload.title !== undefined) patch.title = payload.title;
    api.patchColumn(tableId, columnId, patch)
      .then((saved) => setCustomColumns((prev) => prev.map((cc) => cc.id === saved.id ? saved : cc)))
      .catch((err: unknown) => toast.error(`Failed to update column: ${errMsg(err)}`));
  }, [api, tableId]);

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
    if (!api) return;
    setRows((prev) => [...prev, { id: payload.id, title: payload.title }]);
    setTotal((t) => t + 1);
    recordChange(`Add row "${payload.title}"`);
    api.createRow(tableId, payload.id, { title: payload.title });
    setShowAddRowDialog(false);
  }, [api, recordChange, tableId]);

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
                                  onToggleFrozen={column.id === CLASSES_COL_ID ? undefined : toggleColumnFrozen}
                                  onDeleteCol={deleteCustomColumn}
                                  onUngroup={!isLeaf ? (groupId) => { removeColumnGroup(groupId); setOpenMenuColumn(null); setMenuAnchor(null); } : undefined}
                                  onProperties={column.id === CLASSES_COL_ID ? undefined : (colId) => {
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
                      data-key={ADD_COL_HEADER_KEY}
                      className={[
                        'add-col-th',
                        selectedSet.has(ADD_COL_HEADER_KEY)
                          ? 'header-selected'
                          : selectedCols.has(ADD_COL_VIRTUAL_ID) ? 'col-highlight' : '',
                      ].filter(Boolean).join(' ') || undefined}
                      onClick={(e) => selectKey(ADD_COL_HEADER_KEY, e.metaKey || e.ctrlKey, e.shiftKey)}
                    >
                      <button
                        type="button"
                        className="add-col-button"
                        title="Add column"
                        onClick={(e) => {
                          e.stopPropagation();
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
                      const isClassesColumn = col.id === CLASSES_COL_ID;
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
                            isClassesColumn ? 'classes-col-td' : '',
                            cellFlags[noteKey] ? `flag-${cellFlags[noteKey]}` : '',
                          ].filter(Boolean).join(' ') || undefined}
                          style={col.isFrozen ? { left: frozenLeftByColumn.get(col.id) ?? 0 } : undefined}
                          onClick={(e) => { selectKey(bodyKey, e.metaKey || e.ctrlKey, e.shiftKey); onRowClick?.(rowId); }}
                          onDoubleClick={(e) => {
                            if (isClassesColumn) {
                              e.stopPropagation();
                              setClassEditorState({ rowId, anchor: { top: e.clientY, left: e.clientX } });
                              return;
                            }
                            if (!isCellEditable(col.id)) return;
                            e.stopPropagation();
                            const rawVal = rowVal(row, col.id, col.sourcePath);
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
                          {isClassesColumn ? (
                            <div className="classes-cell-chips">
                              {rowClassIds(row).map((classId) => {
                                const cls = rowClasses.find((candidate) => candidate.id === classId);
                                if (!cls) return null;
                                return (
                                  <span
                                    key={classId}
                                    className="row-class-chip"
                                    style={{ background: cls.color ?? '#6366f1' }}
                                  >
                                    {cls.name}
                                  </span>
                                );
                              })}
                            </div>
                          ) : editingCell?.rowIndex === rowIndex && editingCell?.colId === col.id ? (
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
                              sourcePath={col.sourcePath}
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
                    <td
                      key="__add-col__"
                      data-key={`cell:${rowIndex}:${ADD_COL_VIRTUAL_ID}`}
                      className={[
                        'add-col-td',
                        selectedSet.has(`cell:${rowIndex}:${ADD_COL_VIRTUAL_ID}`)
                          ? 'cell-selected'
                          : selectedCols.has(ADD_COL_VIRTUAL_ID) ? 'col-highlight' : '',
                      ].filter(Boolean).join(' ') || undefined}
                      onClick={(e) => selectKey(`cell:${rowIndex}:${ADD_COL_VIRTUAL_ID}`, e.metaKey || e.ctrlKey, e.shiftKey)}
                    />
                  </tr>
                );
              })}
              <tr
                className="add-row-tr"
                onDoubleClick={() => setShowAddRowDialog(true)}
              >
                {visibleLeafColumns.map((col, colIdx) => {
                  const addRowKey = `add-row:${col.id}`;
                  const isSelected = selectedSet.has(addRowKey);
                  return (
                    <td
                      key={col.id}
                      data-key={addRowKey}
                      className={[
                        'add-row-td',
                        isSelected
                          ? 'cell-selected'
                          : [
                              addRowIsSelected ? 'row-highlight' : '',
                              selectedCols.has(col.id) ? 'col-highlight' : '',
                            ].filter(Boolean).join(' '),
                        col.isFrozen ? 'sticky-col' : '',
                        col.id === CLASSES_COL_ID ? 'classes-col-td' : '',
                      ].filter(Boolean).join(' ')}
                      style={col.isFrozen ? { left: frozenLeftByColumn.get(col.id) ?? 0 } : undefined}
                      onClick={(e) => selectKey(addRowKey, e.metaKey || e.ctrlKey, e.shiftKey)}
                    >
                      {colIdx === 0 ? '+ Add row' : ''}
                    </td>
                  );
                })}
                <td
                  data-key={`add-row:${ADD_COL_VIRTUAL_ID}`}
                  className={[
                    'add-row-td',
                    'add-col-td',
                    selectedSet.has(`add-row:${ADD_COL_VIRTUAL_ID}`)
                      ? 'cell-selected'
                      : [
                          addRowIsSelected ? 'row-highlight' : '',
                          selectedCols.has(ADD_COL_VIRTUAL_ID) ? 'col-highlight' : '',
                        ].filter(Boolean).join(' '),
                  ].filter(Boolean).join(' ')}
                  onClick={(e) => selectKey(`add-row:${ADD_COL_VIRTUAL_ID}`, e.metaKey || e.ctrlKey)}
                />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="table-note">
        <span>{total.toLocaleString()} rows — page {page} of {totalPages}</span>
        <button
          type="button"
          className="ai-fill-trigger-button"
          onClick={() => setShowAiFill(true)}
          title="Fill columns using AI"
        >
          ✦ AI Fill
        </button>
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
      {showAiFill && (
        <AiFillDialog
          tableId={tableId}
          columns={customColumns}
          onClose={() => setShowAiFill(false)}
        />
      )}
      {classEditorState && (
        <RowClassEditor
          tableId={tableId}
          availableClasses={rowClasses}
          selectedClassIds={rowClassIds(rows.find((row) => String(row['id'] ?? '') === classEditorState.rowId))}
          anchor={classEditorState.anchor}
          onConfirm={(selectedIds, newClasses) =>
            handleClassEditorConfirm(classEditorState.rowId, selectedIds, newClasses)
          }
          onClose={() => setClassEditorState(null)}
        />
      )}
    </>
  );
}
