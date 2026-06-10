'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { ChevronDown, ChevronRight, CircleDot } from 'lucide-react';
import { getSyncClient, SyncClient } from '../services/syncClient';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import type { ColumnGroup } from '../hooks/useColumnPrefs';
import { useTableSelection } from '../hooks/useTableSelection';
import ContextMenu from './ContextMenu';
import AddColumnDialog, { type AddColumnPayload, type ColumnDataType } from './AddColumnDialog';
import AddRowDialog from './AddRowDialog';
import type { AddRowPayload } from './AddRowDialog';
import ColumnDeleteConfirmDialog from './ColumnDeleteConfirmDialog';
import RowDeleteConfirmDialog from './RowDeleteConfirmDialog';
import ColumnPropertiesDialog, { type ColumnPropertiesPayload } from './ColumnPropertiesDialog';
import AiFillDialog from './AiFillDialog';
import CellContent from './CellContent';
import RatingStars, { isRatingColumnType } from './RatingStars';
import SyncIndicator from './SyncIndicator';
import { rowVal } from '../utils/rowVal';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './ui/command';
import RowClassEditor from './RowClassEditor';
import type { PickerItem } from './ItemPicker';
import { colFilterParam, type ColType } from '../utils/columnFilters';
import logger from '../utils/logger';

import type { ApiCustomColumn, ApiRemark, CellTarget, PagedResponse, RemarkTarget, DataRow, RowClass } from '../types/table';

// ── Constants ──────────────────────────────────────────────────────────────────

const ADD_COL_VIRTUAL_ID = '__add-col__';
const ADD_COL_HEADER_KEY = `header:${ADD_COL_VIRTUAL_ID}:0`;
const ADD_COL_VIRTUAL_COLUMN = { id: ADD_COL_VIRTUAL_ID, label: '+' };

const CLASSES_COL_ID = 'classes';
const FULL_NAME_COL_ID = 'full_name';
const PARENT_CHILD_FIELD_ID = 'parent_child';

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
type TreeRow = {
  row: DataRow;
  rowId: string;
  depth: number;
  parentId: string | null;
  childIds: string[];
  hasChildren: boolean;
  isExpanded: boolean;
};

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

function rowClassIds(row: DataRow | undefined): string[] {
  const value = row?.[CLASSES_COL_ID];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function relationshipIds(row: DataRow | undefined, fieldId: string): string[] {
  const value = row?.[fieldId];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function appendUniqueId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function insertIdAfter(ids: string[], afterId: string | null | undefined, id: string): string[] {
  const withoutId = ids.filter((candidate) => candidate !== id);
  if (!afterId) return [...withoutId, id];
  const idx = withoutId.indexOf(afterId);
  if (idx < 0) return [...withoutId, id];
  return [...withoutId.slice(0, idx + 1), id, ...withoutId.slice(idx + 1)];
}

function deriveColumns(row: DataRow): Column[] {
  const keys = Object.keys(row);
  const sorted = [
    ...(keys.includes(FULL_NAME_COL_ID) ? [FULL_NAME_COL_ID] : []),
    ...(keys.includes('name') ? ['name'] : []),
    ...keys.filter((k) => k !== FULL_NAME_COL_ID && k !== 'name'),
  ];
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
    return { id: key, label: labelFor(key), width: 120, minWidth: 60, isFrozen: key === FULL_NAME_COL_ID };
  });
}

function isColumnReadOnly(cc: ApiCustomColumn): boolean {
  return cc.readOnly ?? cc.read_only ?? !(cc.is_editable ?? true);
}

function columnTypesForDataType(columnType: ColumnDataType): { types: string[]; data_types: string[] } {
  if (columnType === 'rating') return { types: ['rating'], data_types: ['numeric'] };
  return { types: ['text'], data_types: ['text'] };
}

function isRatingColumn(column: Column): boolean {
  return isRatingColumnType(column.types);
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

type GlobalSearchResult =
  | {
      id: string;
      kind: 'column';
      columnId: string;
      title: string;
      detail: string;
      hidden: boolean;
    }
  | {
      id: string;
      kind: 'displayed-row';
      rowIndex: number;
      rowId: string;
      columnId: string;
      title: string;
      detail: string;
    }
  | {
      id: string;
      kind: 'all-row';
      rowId: string;
      columnId: string | null;
      title: string;
      detail: string;
    };

function searchText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(searchText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function rowTitle(row: DataRow): string {
  const title = rowVal(row, FULL_NAME_COL_ID) ?? rowVal(row, 'fullName') ?? rowVal(row, 'name') ?? rowVal(row, 'title') ?? rowVal(row, 'id');
  const text = searchText(title).trim();
  return text || 'Untitled row';
}

function truncateText(text: string, max = 96): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

function includesNeedle(value: unknown, needle: string): boolean {
  return searchText(value).toLowerCase().includes(needle);
}

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  tableId: string;
  onRowClick?: (rowId: string) => void;
  searchOpenRequest?: number;
};

export default function TreeTable({ tableId, onRowClick, searchOpenRequest = 0 }: Props) {
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

  // ── Global search ──────────────────────────────────────────────────────────
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [allRowSearch, setAllRowSearch] = useState<{
    query: string;
    loading: boolean;
    rows: DataRow[];
    total: number;
    error: string | null;
  }>({ query: '', loading: false, rows: [], total: 0, error: null });
  const [pendingSearchTarget, setPendingSearchTarget] = useState<{ rowId: string; columnId: string | null } | null>(null);
  const [pendingSearchColumnId, setPendingSearchColumnId] = useState<string | null>(null);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSyncClient()
      .then(setApi)
      .catch((err) => toast.error(`Sync init failed: ${errMsg(err)}`));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.altKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) return;
      e.preventDefault();
      setIsGlobalSearchOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!isGlobalSearchOpen) return;
    const focusTimer = setTimeout(() => {
      globalSearchInputRef.current?.focus();
      globalSearchInputRef.current?.select();
    }, 0);
    return () => clearTimeout(focusTimer);
  }, [isGlobalSearchOpen]);

  useEffect(() => {
    if (searchOpenRequest <= 0) return;
    setIsGlobalSearchOpen(true);
  }, [searchOpenRequest]);

  useEffect(() => {
    setRows([]);
    setCustomColumns([]);
    setRowClasses([]);
    setClassEditorState(null);
    setCollapsedRowIds(new Set());
    setRowMenu(null);
    setAddRowRelation(null);
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
      if ('row_class' in ev && ev.row_class.data.table_id === 'classes') {
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
      if ('many_to_many' in ev && ev.many_to_many.data.table_id === tableId && ev.many_to_many.data.field_id === PARENT_CHILD_FIELD_ID) {
        const assignment = ev.many_to_many.data;
        setRows((prev) => prev.map((row) =>
          String(row['id'] ?? '') === assignment.row_id
            ? { ...row, [PARENT_CHILD_FIELD_ID]: assignment.item_ids }
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
    moveColumnsToLeftEdge,
    insertColumnAfter,
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
  const customColumnsRef = useRef(customColumns);
  customColumnsRef.current = customColumns;

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
  const [classDataRows, setClassDataRows] = useState<DataRow[]>([]);
  type ClassEditorState = { rowId: string; anchor: { top: number; left: number } };
  const [classEditorState, setClassEditorState] = useState<ClassEditorState | null>(null);
  const [rowClassesRetryKey, setRowClassesRetryKey] = useState(0);
  const rowClassesRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tree row state ─────────────────────────────────────────────────────────
  const [collapsedRowIds, setCollapsedRowIds] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<{ rowId: string; anchor: { top: number; left: number } } | null>(null);
  const [addRowRelation, setAddRowRelation] = useState<{
    parentIds: string[];
    afterSiblingId?: string | null;
  } | null>(null);

  // ── Column menu state ──────────────────────────────────────────────────────
  const [openMenuColumn, setOpenMenuColumn] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [headerMenuMode, setHeaderMenuMode] = useState<'menu' | 'flag' | 'note' | 'comment'>('menu');
  // ── Add-column / add-row dialogs ──────────────────────────────────────────
  const [addColAfter, setAddColAfter] = useState<string | null>(null);
  const [showAddRowDialog, setShowAddRowDialog] = useState(false);
  type PendingDelete = { colId: string; label: string; notes: number; comments: number; flags: number };
  const [pendingDeleteCol, setPendingDeleteCol] = useState<PendingDelete | null>(null);
  const [deletingCols, setDeletingCols] = useState<Set<string>>(new Set());
  const [pendingDeleteRow, setPendingDeleteRow] = useState<{ rowId: string; label: string } | null>(null);
  const [deletingRows, setDeletingRows] = useState<Set<string>>(new Set());
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
  const [cellMenu, setCellMenu] = useState<{ anchor: { top: number; left: number }; targets: CellTarget[]; focusOnOpen?: boolean; returnFocusKey?: string | null } | null>(null);
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
    const sortColumn = customColumnsRef.current.find((cc) => cc.id === sort.col);
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
  }, [page, sort, filters, api, tableId, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch row classes ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!api || tableId === 'tables') return;
    let active = true;
    api.fetchRowClasses('classes')
      .then((classes) => { if (active) setRowClasses(classes); })
      .catch((err: unknown) => {
        if (!active) return;
        toast.error(`Failed to load row classes: ${errMsg(err)}`, { id: 'fetch-row-classes-error' });
        rowClassesRetryTimerRef.current = setTimeout(() => {
          rowClassesRetryTimerRef.current = null;
          setRowClassesRetryKey((key) => key + 1);
        }, 1_000);
      });
    // Fetch full data rows for tree structure (parent-child) used by the class picker.
    api.fetchDataRows('classes', new URLSearchParams({ page: '1', per_page: '500' }))
      .then((resp) => { if (active) setClassDataRows(resp.data); })
      .catch(() => { /* non-critical — picker falls back to flat list */ });
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
    const userDataColumns = dataColumns.filter((col) => col.id !== PARENT_CHILD_FIELD_ID);
    const result = tableId === 'tables'
      ? userDataColumns.filter((col) => col.id !== CLASSES_COL_ID)
      : [...userDataColumns.filter((col) => col.id !== CLASSES_COL_ID), CLASSES_COLUMN];
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
  }, [columns, setColumnWidths]);

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
  const treeChildIdsByParent = useMemo(() => {
    const visibleRows = rows.filter((row) => {
      const rowId = String(row['id'] ?? '');
      return rowId && !hiddenRowIds.has(rowId);
    });
    const rowById = new Map(visibleRows.map((row) => [String(row['id'] ?? ''), row]));
    const childrenByParent = new Map<string, string[]>();

    for (const row of visibleRows) {
      const parentId = String(row['id'] ?? '');
      const childIds = relationshipIds(row, PARENT_CHILD_FIELD_ID)
        .filter((childId) => childId !== parentId && rowById.has(childId));
      if (childIds.length === 0) continue;
      childrenByParent.set(parentId, childIds);
    }

    return childrenByParent;
  }, [hiddenRowIds, rows]);

  const treeRows = useMemo<TreeRow[]>(() => {
    const visibleRows = rows.filter((row) => {
      const rowId = String(row['id'] ?? '');
      return rowId && !hiddenRowIds.has(rowId);
    });
    const rowById = new Map(visibleRows.map((row) => [String(row['id'] ?? ''), row]));
    const parentsByChild = new Map<string, Set<string>>();

    for (const [parentId, childIds] of treeChildIdsByParent) {
      for (const childId of childIds) {
        const parents = parentsByChild.get(childId) ?? new Set<string>();
        parents.add(parentId);
        parentsByChild.set(childId, parents);
      }
    }

    const result: TreeRow[] = [];
    const pushRow = (row: DataRow, depth: number, parentId: string | null, branch: Set<string>) => {
      const rowId = String(row['id'] ?? '');
      if (!rowId || branch.has(rowId)) return;
      const childIds = treeChildIdsByParent.get(rowId) ?? [];
      const isExpanded = !collapsedRowIds.has(rowId);
      result.push({
        row,
        rowId,
        depth,
        parentId,
        childIds,
        hasChildren: childIds.length > 0,
        isExpanded,
      });
      if (!isExpanded) return;
      const nextBranch = new Set(branch);
      nextBranch.add(rowId);
      for (const childId of childIds) {
        const child = rowById.get(childId);
        if (child) pushRow(child, depth + 1, rowId, nextBranch);
      }
    };

    const roots = visibleRows.filter((row) => !parentsByChild.has(String(row['id'] ?? '')));
    const rowsToRender = roots.length > 0 ? roots : visibleRows;
    rowsToRender.forEach((row) => pushRow(row, 0, null, new Set()));
    return result;
  }, [collapsedRowIds, hiddenRowIds, rows, treeChildIdsByParent]);

  // ── Class picker items: tree-ordered PickerItem[] from /t/classes ──────────
  const treePickerItems = useMemo((): PickerItem[] => {
    const classMap = new Map(rowClasses.map((cls) => [cls.id, cls]));
    if (classDataRows.length === 0) {
      return rowClasses.map((cls) => ({ id: cls.id, label: cls.name, color: cls.color, parentId: null }));
    }
    const rowById = new Map(classDataRows.map((row) => [String(row['id'] ?? ''), row]));
    const childrenByParent = new Map<string, string[]>();
    const childSet = new Set<string>();
    for (const row of classDataRows) {
      const parentId = String(row['id'] ?? '');
      const childIds = relationshipIds(row, PARENT_CHILD_FIELD_ID)
        .filter((id) => id !== parentId && rowById.has(id));
      if (childIds.length > 0) {
        childrenByParent.set(parentId, childIds);
        childIds.forEach((id) => childSet.add(id));
      }
    }
    const result: PickerItem[] = [];
    const addRow = (row: DataRow, depth: number, branch: Set<string>, parentId: string | null) => {
      const id = String(row['id'] ?? '');
      if (!id || branch.has(id)) return;
      const cls = classMap.get(id);
      const label = cls?.name ?? String(row['full_name'] ?? id);
      const color = cls?.color ?? null;
      result.push({ id, label, color, depth, parentId });
      const nextBranch = new Set(branch);
      nextBranch.add(id);
      for (const childId of childrenByParent.get(id) ?? []) {
        const child = rowById.get(childId);
        if (child) addRow(child, depth + 1, nextBranch, id);
      }
    };
    const roots = classDataRows.filter((row) => !childSet.has(String(row['id'] ?? '')));
    roots.forEach((row) => addRow(row, 0, new Set(), null));
    return result;
  }, [classDataRows, rowClasses]);

  // After a new column is added, move selection to it on the current row.
  useEffect(() => {
    const colId = pendingFocusColRef.current;
    if (!colId) return;
    const colIdx = visibleLeafColumns.findIndex((c) => c.id === colId);
    if (colIdx < 0) return;
    pendingFocusColRef.current = null;
    const rowIndex = cursorPos && cursorPos.row >= 0 ? cursorPos.row : 0;
    if (treeRows.length === 0) return;
    const key = `cell:${rowIndex}:${colId}`;
    setSelectedKeys([key]);
    setCursorPos({ row: rowIndex, col: colIdx });
  }, [visibleLeafColumns, treeRows.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
  } = useTableSelection(allColumnsForSelection, leafHeaderKeyWithVirtual, treeRows.length);

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

  const globalSearchTerm = globalSearchQuery.trim();
  const globalSearchNeedle = globalSearchTerm.toLowerCase();

  const cellSearchValue = useCallback((row: DataRow, col: Column): unknown => {
    if (col.id === CLASSES_COL_ID) {
      return rowClassIds(row)
        .map((classId) => rowClasses.find((candidate) => candidate.id === classId)?.name ?? classId)
        .join(' ');
    }
    const compiled = compiledExprs.get(col.id);
    if (compiled) {
      try {
        return compiled(row);
      } catch {
        return '';
      }
    }
    return rowVal(row, col.id, col.sourcePath);
  }, [compiledExprs, rowClasses]);

  useEffect(() => {
    if (!api || !isGlobalSearchOpen || globalSearchTerm.length === 0) {
      setAllRowSearch({ query: globalSearchTerm, loading: false, rows: [], total: 0, error: null });
      return;
    }

    let active = true;
    setAllRowSearch((prev) => ({
      query: globalSearchTerm,
      loading: prev.query !== globalSearchTerm || prev.loading,
      rows: prev.query === globalSearchTerm ? prev.rows : [],
      total: prev.query === globalSearchTerm ? prev.total : 0,
      error: null,
    }));

    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        page: '1',
        per_page: '20',
        q: globalSearchTerm,
      });
      Object.entries(filters).forEach(([key, value]) => {
        if (key !== 'q') params.set(key, value);
      });
      const sortColumn = customColumns.find((cc) => cc.id === sort.col);
      const sortType = sortColumn?.data_types?.[0] ?? sort.colType ?? sortColumn?.types?.[0];
      params.set('sort', sortType ? `${sort.col}:${sort.dir}:${sortType}` : `${sort.col}:${sort.dir}`);

      api.fetchDataRows(tableId, params)
        .then((payload) => {
          if (!active) return;
          setAllRowSearch({
            query: globalSearchTerm,
            loading: false,
            rows: payload.data,
            total: payload.total,
            error: null,
          });
        })
        .catch((err: unknown) => {
          if (!active) return;
          setAllRowSearch({
            query: globalSearchTerm,
            loading: false,
            rows: [],
            total: 0,
            error: errMsg(err),
          });
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, isGlobalSearchOpen, globalSearchTerm, sort, tableId, customColumns, filters]);

  const globalSearchResults = useMemo<GlobalSearchResult[]>(() => {
    if (globalSearchNeedle.length === 0) return [];

    const columnResults: GlobalSearchResult[] = allLeafColumns
      .filter((col) => `${col.label} ${col.id}`.toLowerCase().includes(globalSearchNeedle))
      .slice(0, 8)
      .map((col) => ({
        id: `column:${col.id}`,
        kind: 'column' as const,
        columnId: col.id,
        title: col.label,
        detail: hiddenSet.has(col.id) ? 'Column hidden' : 'Column',
        hidden: hiddenSet.has(col.id),
      }));

    const displayedResults: GlobalSearchResult[] = [];
    for (let rowIndex = 0; rowIndex < treeRows.length && displayedResults.length < 16; rowIndex++) {
      const { row, rowId } = treeRows[rowIndex];
      if (!rowId) continue;
      for (const col of visibleLeafColumns) {
        const value = cellSearchValue(row, col);
        if (!includesNeedle(value, globalSearchNeedle)) continue;
        displayedResults.push({
          id: `displayed:${rowId}:${col.id}`,
          kind: 'displayed-row',
          rowIndex,
          rowId,
          columnId: col.id,
          title: rowTitle(row),
          detail: `${col.label}: ${truncateText(searchText(value))}`,
        });
        break;
      }
    }

    const loadedRowIds = new Set(rows.map((row) => String(row['id'] ?? '')).filter(Boolean));
    const allRowResults: GlobalSearchResult[] = [];
    for (const row of allRowSearch.query === globalSearchTerm ? allRowSearch.rows : []) {
      const rowId = String(row['id'] ?? '');
      if (!rowId || loadedRowIds.has(rowId)) continue;
      let matchedColumn: Column | undefined;
      let matchedValue: unknown;
      for (const col of allLeafColumns) {
        const value = cellSearchValue(row, col);
        if (includesNeedle(value, globalSearchNeedle)) {
          matchedColumn = col;
          matchedValue = value;
          break;
        }
      }
      allRowResults.push({
        id: `all:${rowId}:${matchedColumn?.id ?? ''}`,
        kind: 'all-row',
        rowId,
        columnId: matchedColumn?.id ?? null,
        title: rowTitle(row),
        detail: matchedColumn
          ? `${matchedColumn.label}: ${truncateText(searchText(matchedValue))}`
          : 'All rows',
      });
      if (allRowResults.length >= 16) break;
    }

    return [...columnResults, ...displayedResults, ...allRowResults];
  }, [
    allLeafColumns,
    allRowSearch,
    cellSearchValue,
    globalSearchNeedle,
    globalSearchTerm,
    hiddenSet,
    rows,
    treeRows,
    visibleLeafColumns,
  ]);

  const columnSearchResults = useMemo(
    () => globalSearchResults.filter((result) => result.kind === 'column'),
    [globalSearchResults],
  );
  const displayedRowSearchResults = useMemo(
    () => globalSearchResults.filter((result) => result.kind === 'displayed-row'),
    [globalSearchResults],
  );
  const allRowSearchResults = useMemo(
    () => globalSearchResults.filter((result) => result.kind === 'all-row'),
    [globalSearchResults],
  );
  const addRowParentRows = useMemo(() => {
    const parentIds = addRowRelation?.parentIds ?? [];
    if (parentIds.length === 0) return [];
    return parentIds
      .map((parentId) => rows.find((candidate) => String(candidate['id'] ?? '') === parentId))
      .filter((row): row is DataRow => !!row);
  }, [addRowRelation, rows]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const selectedTreeRowIds = (): string[] => {
    const ids = Array.from(selectedRows)
      .map((rowIndex) => treeRows[parseInt(rowIndex, 10)]?.rowId)
      .filter((id): id is string => !!id);
    if (ids.length > 0) return [...new Set(ids)];
    if (cursorPos && cursorPos.row >= 0 && cursorPos.row < treeRows.length) {
      return [treeRows[cursorPos.row].rowId];
    }
    return [];
  };

  const treeRowIdsWithDescendants = (rowIds: string[]): string[] => {
    const stack = [...rowIds];
    const seen = new Set<string>();

    while (stack.length > 0) {
      const rowId = stack.pop();
      if (!rowId || seen.has(rowId)) continue;
      seen.add(rowId);
      for (const childId of treeChildIdsByParent.get(rowId) ?? []) {
        stack.push(childId);
      }
    }

    return [...seen];
  };

  const setRowsRecursivelyExpanded = (expand: boolean) => {
    const rootRowIds = selectedTreeRowIds();
    if (rootRowIds.length === 0) {
      toast.info('Select one or more rows first.');
      return;
    }

    const rowIds = treeRowIdsWithDescendants(rootRowIds);
    setCollapsedRowIds((prev) => {
      const next = new Set(prev);
      for (const rowId of rowIds) {
        if (expand) next.delete(rowId);
        else if ((treeChildIdsByParent.get(rowId) ?? []).length > 0) next.add(rowId);
      }
      return next;
    });
  };

  const openAddSiblingDialog = () => {
    if (!cursorPos || cursorPos.row < 0 || cursorPos.row >= treeRows.length) {
      setAddRowRelation(null);
      setShowAddRowDialog(true);
      return;
    }
    const treeRow = treeRows[cursorPos.row];
    setAddRowRelation({
      parentIds: treeRow.parentId ? [treeRow.parentId] : [],
      afterSiblingId: treeRow.rowId,
    });
    setShowAddRowDialog(true);
  };

  const openAddChildDialogForRows = (parentIds: string[]) => {
    const uniqueParentIds = [...new Set(parentIds)].filter(Boolean);
    if (uniqueParentIds.length === 0) {
      toast.info('Select one or more rows before adding a child.');
      return;
    }
    setAddRowRelation({ parentIds: uniqueParentIds });
    setShowAddRowDialog(true);
  };

  const cellTargetFromKey = (key: string): CellTarget | null => {
    const parts = key.split(':');
    if (parts[0] !== 'cell') return null;
    const rowIndex = parseInt(parts[1], 10);
    const colId = parts.slice(2).join(':');
    if (!Number.isFinite(rowIndex) || colId === ADD_COL_VIRTUAL_ID) return null;
    const rowId = treeRows[rowIndex]?.rowId;
    if (!rowId) return null;
    return { rowId, colId };
  };

  const openSelectedCellMenu = () => {
    const cursorKey = cursorPos ? cursorToKeyFn(cursorPos) : null;
    const selectedCellKeys = selectedKeys.filter((key) => cellTargetFromKey(key));
    const cursorTarget = cursorKey ? cellTargetFromKey(cursorKey) : null;
    const targetKeys = selectedCellKeys.length > 0
      ? selectedCellKeys
      : cursorKey && cursorTarget
        ? [cursorKey]
        : [];
    const seen = new Set<string>();
    const targets: CellTarget[] = [];

    for (const key of targetKeys) {
      const target = cellTargetFromKey(key);
      if (!target) continue;
      const targetId = `${target.rowId}:${target.colId}`;
      if (seen.has(targetId)) continue;
      seen.add(targetId);
      targets.push(target);
    }

    if (targets.length === 0) {
      toast.info('Select one or more cells first.');
      return;
    }

    const anchorKey = cursorKey && cursorTarget && targetKeys.includes(cursorKey)
      ? cursorKey
      : targetKeys[0];
    const rect = anchorKey
      ? wrapperRef.current?.querySelector(`[data-key="${CSS.escape(anchorKey)}"]`)?.getBoundingClientRect()
      : null;
    const fallbackRect = wrapperRef.current?.getBoundingClientRect();
    setCellMenu({
      anchor: {
        top: (rect?.bottom ?? fallbackRect?.top ?? 0) + window.scrollY + 4,
        left: (rect?.left ?? fallbackRect?.left ?? 0) + window.scrollX,
      },
      targets,
      focusOnOpen: true,
      returnFocusKey: anchorKey,
    });
    setCellMenuMode('menu');
    setDraftText('');
  };

  const focusTableCell = (key?: string | null) => {
    window.setTimeout(() => {
      const fallbackKey = cursorPos ? cursorToKeyFn(cursorPos) : null;
      const focusKey = key ?? fallbackKey;
      const cell = focusKey
        ? wrapperRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)
        : null;
      (cell ?? wrapperRef.current)?.focus();
    }, 0);
  };

  const closeCellMenu = () => {
    const returnFocusKey = cellMenu?.returnFocusKey;
    setCellMenu(null);
    focusTableCell(returnFocusKey);
  };

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) return; // let the input handle keys

    if (e.key === 'ContextMenu' || e.key === 'Apps') {
      e.preventDefault();
      e.stopPropagation();
      openSelectedCellMenu();
      return;
    }

    if (e.key === 'Enter') {
      if ((e.metaKey || e.ctrlKey) && e.altKey) {
        e.preventDefault();
        openAddChildDialogForRows(selectedTreeRowIds());
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        openAddSiblingDialog();
        return;
      }
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        openSelectedCellMenu();
        return;
      }

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
      if (selectedColumnId === CLASSES_COL_ID && cursorPos && cursorPos.row >= 0 && cursorPos.row < treeRows.length) {
        e.preventDefault();
        const rowId = treeRows[cursorPos.row]?.rowId ?? '';
        const key = `cell:${cursorPos.row}:${CLASSES_COL_ID}`;
        const rect = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`)?.getBoundingClientRect();
        setClassEditorState({
          rowId,
          anchor: { top: rect?.bottom ?? 0, left: rect?.left ?? 0 },
        });
        return;
      }
      if (cursorPos && cursorPos.row === treeRows.length) {
        e.preventDefault();
        setAddRowRelation(null);
        setShowAddRowDialog(true);
        return;
      }
      if (cursorPos && cursorPos.row >= 0) {
        const col = visibleLeafColumns[cursorPos.col];
        const row = treeRows[cursorPos.row]?.row;
        if (col && row && isCellEditable(col.id) && !isRatingColumn(col)) {
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

    if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      setRowsRecursivelyExpanded(e.key === 'ArrowRight');
      return;
    }

    if (e.ctrlKey && e.altKey && !e.shiftKey && cursorPos && cursorPos.row >= 0 && cursorPos.row < treeRows.length) {
      const treeRow = treeRows[cursorPos.row];
      if (e.key === 'ArrowRight' && treeRow.hasChildren && !treeRow.isExpanded) {
        setCollapsedRowIds((prev) => {
          const next = new Set(prev);
          next.delete(treeRow.rowId);
          return next;
        });
        return;
      }
      if (e.key === 'ArrowLeft') {
        if (treeRow.hasChildren && treeRow.isExpanded) {
          setCollapsedRowIds((prev) => new Set(prev).add(treeRow.rowId));
          return;
        }
        if (treeRow.parentId) {
          const parentIndex = treeRows.findIndex((candidate) => candidate.rowId === treeRow.parentId);
          if (parentIndex >= 0) {
            const colId = allColumnsForSelection[cursorPos.col]?.id;
            if (colId) selectKey(`cell:${parentIndex}:${colId}`, false);
            return;
          }
        }
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') return;
    }

    moveCursor(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', e.shiftKey);
  };

  const handleTableMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!e.shiftKey || e.button !== 0) return;
    if (!(e.target instanceof HTMLElement)) return;
    if (!e.target.closest('[data-key]')) return;
    if (e.target.closest('input, textarea, select, button, [contenteditable], [role="textbox"]')) return;

    e.preventDefault();
    window.getSelection()?.removeAllRanges();
  }, []);

  const restoreEditCursor = useCallback((rowIndex: number, colId: string) => {
    const key = `cell:${rowIndex}:${colId}`;
    setSelectedKeys([key]);
    const colIdx = visibleLeafColumns.findIndex((c) => c.id === colId);
    if (colIdx >= 0) setCursorPos({ row: rowIndex, col: colIdx });
  }, [setSelectedKeys, setCursorPos, visibleLeafColumns]);

  const saveCellValue = useCallback((rowIndex: number, rowId: string, colId: string, value: unknown) => {
    if (!api) return;
    restoreEditCursor(rowIndex, colId);
    setRows((prev) => prev.map((row) => String(row['id'] ?? '') === rowId ? { ...row, [colId]: value } : row));
    recordChange(`Edit cell [${colId}]`);
    api.upsertCellValue(rowId, colId, value, tableId)
      .catch((err: unknown) => toast.error(`Failed to queue cell edit: ${errMsg(err)}`));
  }, [recordChange, api, tableId, restoreEditCursor]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, rowId, colId, value } = editingCell;
    setEditingCell(null);
    saveCellValue(rowIndex, rowId, colId, value);
  }, [editingCell, saveCellValue]);

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
        await api.createRowClass('classes', cls.id, cls.name, cls.color);
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
        const row = treeRows[ri]?.row;
        if (row) {
          const rowId = String(row['id'] ?? '');
          history.replaceState(null, '', `#${encodeURIComponent(rowId)}--${encodeURIComponent(colId)}`);
        }
      }
    }
  }, [cursorPos, treeRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // On rows load, jump to the cell referenced in the URL hash.
  useEffect(() => {
    if (treeRows.length === 0 || typeof window === 'undefined') return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const sepIdx = hash.indexOf('--');
    if (sepIdx < 0) return;
    const targetRowId = decodeURIComponent(hash.slice(0, sepIdx));
    const targetColId = decodeURIComponent(hash.slice(sepIdx + 2));
    const ri = treeRows.findIndex((r) => r.rowId === targetRowId);
    if (ri < 0) return;
    const bodyKey = `cell:${ri}:${targetColId}`;
    const el = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(bodyKey)}"]`);
    el?.scrollIntoView({ block: 'center', inline: 'nearest' });
    selectKey(bodyKey, false);
  }, [treeRows]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (toAdd.length === 0) return prev;
      setDeletingCols((d) => new Set([...d, ...toAdd]));
      setTimeout(() => {
        setHiddenColumns((h) => [...h, ...toAdd.filter((id) => !h.includes(id))]);
        setDeletingCols((d) => { const next = new Set(d); toAdd.forEach((id) => next.delete(id)); return next; });
      }, 380);
      return prev;
    });
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  }, [api]);

  const showColumn = useCallback((id: string) => {
    setHiddenColumns((prev) => prev.filter((c) => c !== id));
    api?.removeHiddenColumn(id);
  }, [api]);
  const showAllColumns = useCallback(() => {
    hiddenColumns.forEach((id) => api?.removeHiddenColumn(id));
    setHiddenColumns([]);
    setOpenMenuColumn(null);
  }, [api, hiddenColumns]);

  const closeGlobalSearch = useCallback(() => {
    setIsGlobalSearchOpen(false);
    wrapperRef.current?.focus();
  }, []);

  const selectSearchCell = useCallback((rowIndex: number, columnId: string | null) => {
    const selectedColumnId = columnId && visibleLeafColumns.some((col) => col.id === columnId)
      ? columnId
      : visibleLeafColumns[0]?.id;
    if (!selectedColumnId) return;
    selectKey(`cell:${rowIndex}:${selectedColumnId}`, false);
  }, [selectKey, visibleLeafColumns]);

  const activateGlobalSearchResult = useCallback((result: GlobalSearchResult | undefined) => {
    if (!result) return;

    if (result.kind === 'column') {
      if (hiddenSet.has(result.columnId)) showColumn(result.columnId);
      setPendingSearchColumnId(result.columnId);
      closeGlobalSearch();
      return;
    }

    if (result.kind === 'displayed-row') {
      selectSearchCell(result.rowIndex, result.columnId);
      closeGlobalSearch();
      return;
    }

    setPendingSearchTarget({ rowId: result.rowId, columnId: result.columnId });
    setFilters((prev) => ({ ...prev, q: globalSearchTerm }));
    setPage(1);
    closeGlobalSearch();
  }, [closeGlobalSearch, globalSearchTerm, hiddenSet, selectSearchCell, showColumn]);

  useEffect(() => {
    if (!pendingSearchColumnId) return;
    if (hiddenSet.has(pendingSearchColumnId)) {
      showColumn(pendingSearchColumnId);
      return;
    }
    const headerKey = leafHeaderKey.get(pendingSearchColumnId);
    if (!headerKey) return;
    selectKey(headerKey, false);
    setPendingSearchColumnId(null);
  }, [hiddenSet, leafHeaderKey, pendingSearchColumnId, selectKey, showColumn]);

  useEffect(() => {
    if (!pendingSearchTarget) return;
    const rowIndex = treeRows.findIndex((row) => row.rowId === pendingSearchTarget.rowId);
    if (rowIndex < 0) return;
    if (pendingSearchTarget.columnId && hiddenSet.has(pendingSearchTarget.columnId)) {
      showColumn(pendingSearchTarget.columnId);
      return;
    }
    selectSearchCell(rowIndex, pendingSearchTarget.columnId);
    setPendingSearchTarget(null);
  }, [hiddenSet, pendingSearchTarget, treeRows, selectSearchCell, showColumn]);

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
      if (!(e.target as HTMLElement).closest('.context-menu')) closeCellMenu();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [cellMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rowMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.row-object-menu')) setRowMenu(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [rowMenu]);

  // All stable column ids currently visible, used for duplicate-ID validation.
  const existingColNames = useMemo<Set<string>>(() => new Set([
    ...allLeafColumns.map((c) => c.id),
    ...customColumns.map((cc) => cc.id),
  ]), [allLeafColumns, customColumns]);

  const handleDialogConfirm = useCallback((afterColId: string, payload: AddColumnPayload) => {
    if (!api) return;
    setAddColAfter(null);
    setOpenMenuColumn(null);
    setMenuAnchor(null);
    const id = payload.customId ?? nanoid();
    const positionAfter = afterColId || null;
    const typeMetadata = columnTypesForDataType(payload.columnType);
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
      types: typeMetadata.types,
      data_types: typeMetadata.data_types,
    };
    setCustomColumns((prev) => [...prev, col]);
    insertColumnAfter(id, positionAfter);
    pendingFocusColRef.current = id;
    recordChange(`Create column "${col.title ?? col.id}"`);
    api.createCustomColumn(tableId, {
      title: col.title,
      description: col.description,
      expression: col.expression,
      position_before: col.position_before,
      position_after: col.position_after,
      types: col.types,
      data_types: col.data_types,
    }, id);
  }, [api, recordChange, tableId, insertColumnAfter]);

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
    setHiddenColumns((prev) => prev.filter((c) => c !== colId));
    setPendingDeleteCol(null);
    setDeletingCols((prev) => new Set([...prev, colId]));
    setTimeout(() => {
      setCustomColumns((prev) => prev.filter((c) => c.id !== colMeta.id));
      setDeletingCols((prev) => { const next = new Set(prev); next.delete(colId); return next; });
    }, 380);
  }, [api, customColByColumnId, pendingDeleteCol, recordChange]);

  const deleteRow = useCallback((rowId: string) => {
    setRowMenu(null);
    const rowData = rows.find((r) => String(r['id'] ?? '') === rowId);
    const label = rowTitle(rowData ?? {});
    setPendingDeleteRow({ rowId, label });
  }, [rows]);

  const confirmDeleteRow = useCallback(() => {
    if (!pendingDeleteRow || !api) return;
    const { rowId } = pendingDeleteRow;
    setPendingDeleteRow(null);
    setDeletingRows((prev) => new Set([...prev, rowId]));
    recordChange(`Delete row`);
    api.deleteRow(tableId, rowId)
      .catch((err: unknown) => toast.error(`Failed to delete row: ${errMsg(err)}`));
    setTimeout(() => {
      setRows((prev) => prev.filter((r) => String(r['id'] ?? '') !== rowId));
      setTotal((t) => Math.max(0, t - 1));
      setDeletingRows((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
    }, 330);
  }, [api, pendingDeleteRow, recordChange, tableId]);

  const openAddChildDialog = useCallback((parentId: string) => {
    setAddRowRelation({ parentIds: [parentId] });
    setShowAddRowDialog(true);
    setRowMenu(null);
  }, []);

  const handleAddRowConfirm = useCallback((payload: AddRowPayload) => {
    if (!api) return;
    const relation = addRowRelation;
    setRows((prev) => {
      const childRow = { id: payload.id, [FULL_NAME_COL_ID]: payload.title, [PARENT_CHILD_FIELD_ID]: [] };
      const insertAfterRow = (nextRows: DataRow[]) => {
        if (!relation?.afterSiblingId) return [...nextRows, childRow];
        const idx = nextRows.findIndex((row) => String(row['id'] ?? '') === relation.afterSiblingId);
        if (idx < 0) return [...nextRows, childRow];
        return [...nextRows.slice(0, idx + 1), childRow, ...nextRows.slice(idx + 1)];
      };
      if (!relation || relation.parentIds.length === 0) return insertAfterRow(prev);
      const parentIds = new Set(relation.parentIds);
      const nextRows = prev.map((row) => {
          const rowId = String(row['id'] ?? '');
          if (!parentIds.has(rowId)) return row;
          const existingIds = relationshipIds(row, PARENT_CHILD_FIELD_ID);
          const nextIds = relation.afterSiblingId
            ? insertIdAfter(existingIds, relation.afterSiblingId, payload.id)
            : appendUniqueId(existingIds, payload.id);
          return {
            ...row,
            [PARENT_CHILD_FIELD_ID]: nextIds,
          };
        });
      return insertAfterRow(nextRows);
    });
    setTotal((t) => t + 1);
    recordChange(relation?.parentIds.length ? `Add related row "${payload.title}"` : `Add row "${payload.title}"`);
    api.createRow(tableId, payload.id, { full_name: payload.title });
    if (relation?.parentIds.length) {
      setCollapsedRowIds((prev) => {
        const next = new Set(prev);
        relation.parentIds.forEach((parentId) => next.delete(parentId));
        return next;
      });
      relation.parentIds.forEach((parentId) => {
        const parent = rows.find((row) => String(row['id'] ?? '') === parentId);
        const existingIds = relationshipIds(parent, PARENT_CHILD_FIELD_ID);
        const nextChildren = relation.afterSiblingId
          ? insertIdAfter(existingIds, relation.afterSiblingId, payload.id)
          : appendUniqueId(existingIds, payload.id);
        api.setManyToMany(tableId, parentId, PARENT_CHILD_FIELD_ID, nextChildren)
          .catch((err: unknown) => toast.error(`Failed to attach child row: ${errMsg(err)}`));
      });
    }
    setAddRowRelation(null);
    setShowAddRowDialog(false);
  }, [addRowRelation, api, recordChange, rows, tableId]);

  const handleFlagsChange = useCallback((toSet: Record<string, string>, toDelete: string[]) => {
    if (!api) return;
    setCellFlags((prev) => {
      const next = { ...prev, ...toSet };
      toDelete.forEach((k) => delete next[k]);
      return next;
    });
    Object.entries(toSet).forEach(([key, classId]) => {
      const cls = rowClasses.find((c) => c.id === classId);
      recordChange(`Flag: ${cls?.name ?? classId}`);
      api.upsertFlag(key, classId);
    });
    toDelete.forEach((key) => { recordChange('Remove flag'); api.deleteFlag(key); });
  }, [api, recordChange, rowClasses]);

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
  }, [api, recordChange]);

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
      {isGlobalSearchOpen && (
        <CommandDialog open={isGlobalSearchOpen} onOpenChange={(open) => (open ? setIsGlobalSearchOpen(true) : closeGlobalSearch())}>
          <Command shouldFilter={false}>
            <div className="flex items-center border-b border-app-border">
              <CommandInput
                ref={globalSearchInputRef}
                value={globalSearchQuery}
                onValueChange={setGlobalSearchQuery}
                placeholder="Search columns and rows"
              />
              <CommandShortcut className="mr-3 hidden rounded-app border border-app-border bg-app-soft px-2 py-1 font-semibold tracking-normal sm:inline-block">
                Ctrl Alt F
              </CommandShortcut>
            </div>
            <CommandList>
              {globalSearchTerm.length > 0 && columnSearchResults.length > 0 && (
                <CommandGroup heading="Columns">
                  {columnSearchResults.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={result.id}
                      onSelect={() => activateGlobalSearchResult(result)}
                    >
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{result.title}</span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-app-muted">{result.detail}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {globalSearchTerm.length > 0 && displayedRowSearchResults.length > 0 && (
                <CommandGroup heading="Displayed Rows">
                  {displayedRowSearchResults.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={result.id}
                      onSelect={() => activateGlobalSearchResult(result)}
                    >
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{result.title}</span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-app-muted">{result.detail}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {globalSearchTerm.length > 0 && allRowSearchResults.length > 0 && (
                <CommandGroup heading="All Rows">
                  {allRowSearchResults.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={result.id}
                      onSelect={() => activateGlobalSearchResult(result)}
                    >
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{result.title}</span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-app-muted">{result.detail}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {globalSearchTerm.length > 0 && globalSearchResults.length === 0 && !allRowSearch.loading && !allRowSearch.error && (
                <CommandEmpty>No matches</CommandEmpty>
              )}
              {globalSearchTerm.length > 0 && allRowSearch.loading && (
                <div className="px-3 py-4 text-sm text-app-muted">Searching all rows...</div>
              )}
              {globalSearchTerm.length > 0 && allRowSearch.error && (
                <div className="px-3 py-4 text-sm text-app-danger">All-row search failed: {allRowSearch.error}</div>
              )}
            </CommandList>
          </Command>
        </CommandDialog>
      )}
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
          onMouseDownCapture={handleTableMouseDownCapture}
          style={{ outline: 'none' }}
        >
          <table className="tree-table">
            <colgroup>
              {visibleLeafColumns.map((col) => (
                <col
                  key={col.id}
                  style={{
                    width: deletingCols.has(col.id) ? '0px' : `${columnWidths[col.id] ?? 120}px`,
                    minWidth: deletingCols.has(col.id) ? '0px' : '8px',
                    transition: 'width 0.3s ease-out, min-width 0.3s ease-out',
                  }}
                />
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
                    ).filter((id) => allLeafColumns.some((c) => c.id === id));
                    const selectedLeafIds = allLeafColumns
                      .filter((c) => selectedCols.has(c.id) && !hiddenSet.has(c.id))
                      .map((c) => c.id);
                    const allColsToHide = [...new Set([...leafIdsToHide, ...selectedLeafIds])];
                    const showMenu = leafIdsToHide.length > 0 || isLeaf;
                    const frozenLeft = isLeaf ? frozenLeftByColumn.get(column.id) : undefined;
                    const isSticky = frozenLeft !== undefined;
                    const colHasFilter = () => {
                      const p = colFilterParam(column);
                      return !!p && !!filters[p];
                    };

                    const headerFlagClassId = cellFlags[`header:${column.id}`];
                    const headerFlagClass = headerFlagClassId ? rowClasses.find((c) => c.id === headerFlagClassId) : undefined;
                    const headerFlagStyle: React.CSSProperties | undefined = headerFlagClass?.color
                      ? { background: `${headerFlagClass.color}1a`, boxShadow: `inset 3px 0 0 ${headerFlagClass.color}` }
                      : undefined;

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
                          dragOverCol === column.id ? 'col-drag-over' : '',
                          dragGroupTarget === column.id ? 'col-drag-group' : '',
                          isLeaf && deletingCols.has(column.id) ? 'col-deleting-cell' : '',
                        ].filter(Boolean).join(' ') || undefined}
                        style={{ ...(isSticky ? { left: frozenLeft } : undefined), ...headerFlagStyle }}
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
                                  onMoveToLeftEdge={(colIds) => { moveColumnsToLeftEdge(colIds, allLeafColumns.map((c) => c.id)); setOpenMenuColumn(null); setMenuAnchor(null); }}
                                  onAddColClick={(colId) => { setAddColAfter(colId || null); setOpenMenuColumn(null); setMenuAnchor(null); }}
                                  onToggleFrozen={column.id === CLASSES_COL_ID ? undefined : toggleColumnFrozen}
                                  onDeleteCol={deleteCustomColumn}
                                  onUngroup={!isLeaf ? (groupId) => { removeColumnGroup(groupId); setOpenMenuColumn(null); setMenuAnchor(null); } : undefined}
                                  onProperties={column.id === CLASSES_COL_ID ? undefined : (colId) => {
                                    const cc = customColumns.find((c) => c.id === colId) ?? customColByColumnId.get(colId);
                                    if (cc) setPropertiesCol(cc);
                                    setOpenMenuColumn(null); setMenuAnchor(null);
                                  }}
                                  availableClasses={rowClasses}
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
              {treeRows.map((treeRow: TreeRow, rowIndex: number) => {
                const { row, rowId } = treeRow;
                return (
                  <tr
                    key={`${rowId}:${treeRow.parentId ?? 'root'}:${rowIndex}`}
                    className={[
                      treeRow.depth > 0 ? 'tree-child-row' : '',
                      deletingRows.has(rowId) ? 'row-deleting' : '',
                    ].filter(Boolean).join(' ') || undefined}
                    data-tree-depth={treeRow.depth}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {visibleLeafColumns.map((col: Column, colIdx: number) => {
                      const bodyKey = `cell:${rowIndex}:${col.id}`;
                      const noteKey = `${rowId}:${col.id}`;
                      const isClassesColumn = col.id === CLASSES_COL_ID;
                      const isTreeControlCell = colIdx === 0;
                      const flagClassId = cellFlags[noteKey];
                      const flagClass = flagClassId ? rowClasses.find((c) => c.id === flagClassId) : undefined;
                      const flagStyle: React.CSSProperties | undefined = flagClass?.color
                        ? { background: `${flagClass.color}1a`, boxShadow: `inset 3px 0 0 ${flagClass.color}` }
                        : undefined;
                      return (
                        <td
                          key={bodyKey}
                          data-key={bodyKey}
                          tabIndex={-1}
                          className={[
                            selectedSet.has(bodyKey)
                              ? 'cell-selected'
                              : [
                                  selectedRows.has(String(rowIndex)) ? 'row-highlight' : '',
                                  selectedCols.has(col.id) ? 'col-highlight' : '',
                                ].filter(Boolean).join(' '),
                            col.isFrozen ? 'sticky-col' : '',
                            isClassesColumn ? 'classes-col-td' : '',
                            deletingCols.has(col.id) ? 'col-deleting-cell' : '',
                          ].filter(Boolean).join(' ') || undefined}
                          style={{ ...(col.isFrozen ? { left: frozenLeftByColumn.get(col.id) ?? 0 } : undefined), ...flagStyle }}
                          onClick={(e) => { selectKey(bodyKey, e.metaKey || e.ctrlKey, e.shiftKey); onRowClick?.(rowId); }}
                          onDoubleClick={(e) => {
                            if (isClassesColumn) {
                              e.stopPropagation();
                              setClassEditorState({ rowId, anchor: { top: e.clientY, left: e.clientX } });
                              return;
                            }
                            if (isRatingColumn(col)) return;
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
                                    rowId: treeRows[parseInt(p[1], 10)]?.rowId ?? '',
                                    colId: p[2],
                                  };
                                })
                              : [{ rowId, colId: col.id }];
                            setCellMenu({ anchor: { top: e.clientY + window.scrollY, left: e.clientX + window.scrollX }, targets, returnFocusKey: bodyKey });
                            setCellMenuMode('menu');
                            setDraftText('');
                          }}
                        >
                          {isTreeControlCell && (
                            <span className="tree-row-controls" style={{ paddingLeft: `${treeRow.depth}ch` }}>
                              {treeRow.hasChildren ? (
                                <button
                                  type="button"
                                  className="tree-expand-button"
                                  aria-label={treeRow.isExpanded ? 'Collapse row' : 'Expand row'}
                                  title={treeRow.isExpanded ? 'Collapse row' : 'Expand row'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCollapsedRowIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(rowId)) next.delete(rowId);
                                      else next.add(rowId);
                                      return next;
                                    });
                                  }}
                                >
                                  {treeRow.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              ) : (
                                <span className="tree-expand-spacer" />
                              )}
                              <button
                                type="button"
                                className="row-object-button"
                                aria-label={`Row actions for ${rowTitle(row)}`}
                                title="Row actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setRowMenu({
                                    rowId,
                                    anchor: { top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX },
                                  });
                                }}
                              >
                                <CircleDot size={13} />
                              </button>
                            </span>
                          )}
                          <span className={isTreeControlCell ? 'tree-cell-content' : undefined}>
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
                            ) : isRatingColumn(col) && isCellEditable(col.id) ? (
                              <RatingStars
                                value={rowVal(row, col.id, col.sourcePath)}
                                onChange={(value) => saveCellValue(rowIndex, rowId, col.id, value)}
                              />
                            ) : (
                              <CellContent
                                row={row}
                                colId={col.id}
                                sourcePath={col.sourcePath}
                                types={col.types}
                                formatNumericStrings={col.filterType === 'numeric' || col.types?.includes('numeric')}
                                compiledExpr={compiledExprs.get(col.id)}
                                hasNote={cellRemarks[noteKey]?.some((r) => r.kind === 'note') ?? false}
                                hasComment={cellRemarks[noteKey]?.some((r) => r.kind === 'comment') ?? false}
                              />
                            )}
                          </span>
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
                onDoubleClick={() => { setAddRowRelation(null); setShowAddRowDialog(true); }}
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
          focusOnOpen={cellMenu.focusOnOpen}
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
          availableClasses={rowClasses}
          onClose={closeCellMenu}
        />
      )}
      {rowMenu && (
        <div
          className="row-object-menu"
          style={{ position: 'absolute', top: rowMenu.anchor.top, left: rowMenu.anchor.left }}
        >
          <button
            type="button"
            onClick={() => openAddChildDialog(rowMenu.rowId)}
          >
            Add child
          </button>
          <button
            type="button"
            onClick={() => deleteRow(rowMenu.rowId)}
          >
            Delete row
          </button>
        </div>
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
      {pendingDeleteRow && (
        <RowDeleteConfirmDialog
          rowLabel={pendingDeleteRow.label}
          onConfirm={confirmDeleteRow}
          onCancel={() => setPendingDeleteRow(null)}
        />
      )}
      {showAddRowDialog && (
        <AddRowDialog
          parentRows={addRowParentRows}
          onConfirm={handleAddRowConfirm}
          onClose={() => { setShowAddRowDialog(false); setAddRowRelation(null); }}
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
          availableItems={treePickerItems}
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
