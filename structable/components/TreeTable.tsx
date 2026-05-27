'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TableApi } from '../services/tableApi';
import { useToast } from '../hooks/useToast';
import ToastStack from './ToastStack';
import ContextMenu from './ContextMenu';
import CellContent from './CellContent';

import type { ApiComment, ApiCustomColumn, CellTarget, RepoRow } from '../types/table';

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PINNED_COL = 'name';
const MIGRATION_KEY = 'structable:migrated-v2';

type ColumnMeta = { width?: number; label?: string };

const COLUMNS: Record<string, ColumnMeta> = {
  name:           { width: 220, label: 'Repo' },
  description:    { width: 320 },
  owner_login:    { width: 130 },
  language:       { width: 120 },
  license:        { width: 120 },
  stars:          { width: 90 },
  forks:          { width: 80 },
  open_issues:    { width: 80 },
  size:           { width: 80 },
  stars_now:      { width: 90 },
  stars_diff_6h:  { width: 80 },
  stars_diff_12h: { width: 80 },
  stars_diff_24h: { width: 80 },
  stars_diff_48h: { width: 80 },
  stars_diff_5d:  { width: 80 },
  stars_diff_7d:  { width: 80 },
  stars_diff_10d: { width: 80 },
  stars_diff_14d: { width: 80 },
  stars_diff_20d: { width: 80 },
  stars_diff_30d: { width: 80 },
  pushed_at:      { width: 170 },
  created_at:     { width: 170 },
  updated_at:     { width: 170 },
  visibility:     { width: 100 },
  archived:       { width: 80 },
  disabled:       { width: 80 },
  topics:         { width: 200 },
};

// ── Local types ────────────────────────────────────────────────────────────────

type Column = {
  id: string;
  label: string;
  width?: number;
  minWidth?: number;
  subColumns?: Column[];
};

type HeaderCell = { column: Column; colSpan: number; rowSpan: number; depth: number };

type PagedResponse = { data: RepoRow[]; total: number; page: number; per_page: number };

// ── Utility functions ──────────────────────────────────────────────────────────

function labelFor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveColumns(row: RepoRow): Column[] {
  const keys = Object.keys(row);
  const sorted = [...(keys.includes(PINNED_COL) ? [PINNED_COL] : []), ...keys.filter((k) => k !== PINNED_COL)];
  return sorted.map((key) => ({
    id: key,
    label: COLUMNS[key]?.label ?? labelFor(key),
    width: COLUMNS[key]?.width ?? 120,
    minWidth: 60,
  }));
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

function colFilterParam(key: string): string | null {
  if (key.endsWith('_at') || ['id', 'gh_id'].includes(key)) return null;
  if (['archived', 'disabled'].includes(key)) return key;
  if (['name', 'description'].includes(key)) return 'q';
  if (['language', 'license', 'visibility', 'owner_login'].includes(key)) return key;
  if (key === 'stars' || key === 'forks' || key === 'open_issues' || key === 'size' ||
      key === 'stars_now' || key.startsWith('stars_diff_')) return `${key}_min`;
  return null;
}

function keyToCursor(key: string, leafCols: Column[]): { row: number; col: number } | null {
  if (key.startsWith('header:')) {
    const colId = key.split(':')[1];
    const idx = leafCols.findIndex((c) => c.id === colId);
    return idx >= 0 ? { row: -1, col: idx } : null;
  }
  if (key.startsWith('cell:')) {
    const parts = key.split(':');
    const idx = leafCols.findIndex((c) => c.id === parts[2]);
    return idx >= 0 ? { row: parseInt(parts[1], 10), col: idx } : null;
  }
  return null;
}

function cursorToKey(
  pos: { row: number; col: number },
  leafCols: Column[],
  leafHeaderKey: Map<string, string>,
  numRows: number,
): string | null {
  if (pos.col < 0 || pos.col >= leafCols.length) return null;
  const col = leafCols[pos.col];
  if (pos.row === -1) return leafHeaderKey.get(col.id) ?? null;
  if (pos.row < 0 || pos.row >= numRows) return null;
  return `cell:${pos.row}:${col.id}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TreeTable() {
  const { toasts, addToast, dismissToast } = useToast();

  const api = useMemo(
    () => new TableApi({ baseUrl: API_BASE, onError: (msg) => addToast(msg, 'error') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Repo data ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<RepoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [cursorPos, setCursorPos] = useState<{ row: number; col: number } | null>(null);
  const anchorPosRef = useRef<{ row: number; col: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Column state ───────────────────────────────────────────────────────────
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('structable:column-widths') ?? '{}'); } catch { return {}; }
  });
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('structable:column-order') ?? '[]'); } catch { return []; }
  });
  const [customColumns, setCustomColumns] = useState<ApiCustomColumn[]>([]);

  // ── Drag-to-reorder state ──────────────────────────────────────────────────
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // ── Hidden rows (optimistic local set) ────────────────────────────────────
  const [hiddenRepoIds, setHiddenRepoIds] = useState<Set<number>>(new Set());

  // ── Column menu state ──────────────────────────────────────────────────────
  const [openMenuColumn, setOpenMenuColumn] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [headerMenuMode, setHeaderMenuMode] = useState<'menu' | 'flag' | 'note' | 'comment'>('menu');
  const [addingColAfter, setAddingColAfter] = useState<string | null>(null);
  const [newColName, setNewColName] = useState('');
  const [newColId, setNewColId] = useState('');
  const [newColExpr, setNewColExpr] = useState('');

  // ── Sort & filter ──────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'stars_diff_14d', dir: 'desc' });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});

  // ── Cell annotations ───────────────────────────────────────────────────────
  const [cellNotes, setCellNotes] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('structable:cell-notes') ?? '{}'); } catch { return {}; }
  });
  const [cellFlags, setCellFlags] = useState<Record<string, string>>({});
  const [cellComments, setCellComments] = useState<Record<string, { id: number; body: string }>>({});

  // ── Cell menu state ────────────────────────────────────────────────────────
  const [cellMenu, setCellMenu] = useState<{ anchor: { top: number; left: number }; targets: CellTarget[] } | null>(null);
  const [cellMenuMode, setCellMenuMode] = useState<'menu' | 'note' | 'comment' | 'flag'>('menu');
  const [draftText, setDraftText] = useState('');

  const resizingRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const perPage = 50;

  // ── Bootstrap: load flags, hidden columns, hidden rows, comments ───────────
  useEffect(() => {
    const doBootstrap = async () => {
      try {
        const [flagsData, hiddenColsData, hiddenRowsData, commentsData] = await Promise.all([
          api.fetchFlags(),
          api.fetchHiddenColumns(),
          api.fetchHiddenRows(),
          api.fetchComments(),
        ]);

        // Load flags into state
        const flagMap: Record<string, string> = {};
        flagsData.forEach((f) => { flagMap[f.key] = f.color; });

        // One-time migration from localStorage to backend
        if (!localStorage.getItem(MIGRATION_KEY)) {
          const localFlags: Record<string, string> = (() => {
            try { return JSON.parse(localStorage.getItem('structable:cell-flags') ?? '{}'); } catch { return {}; }
          })();
          const localHidden: string[] = (() => {
            try { return JSON.parse(localStorage.getItem('structable:hidden-columns') ?? '[]'); } catch { return []; }
          })();

          if (flagsData.length === 0 && Object.keys(localFlags).length > 0) {
            Object.entries(localFlags).forEach(([key, color]) => api.upsertFlag(key, color));
            Object.assign(flagMap, localFlags);
          }
          if (hiddenColsData.length === 0 && localHidden.length > 0) {
            localHidden.forEach((id) => api.addHiddenColumn(id));
            setHiddenColumns(localHidden);
          } else {
            setHiddenColumns(hiddenColsData.map((c) => c.column_id));
          }
          localStorage.setItem(MIGRATION_KEY, '1');
        } else {
          setHiddenColumns(hiddenColsData.map((c) => c.column_id));
        }

        setCellFlags(flagMap);
        setHiddenRepoIds(new Set(hiddenRowsData.map((r) => r.repo_id)));

        // Load comments
        const commentMap: Record<string, { id: number; body: string }> = {};
        commentsData.forEach((c) => {
          const key = c.repo_id === 0 ? `header:${c.column_id}` : `${c.repo_id}:${c.column_id}`;
          commentMap[key] = { id: c.id, body: c.body };
        });
        setCellComments(commentMap);
      } catch (err) {
        addToast(`Failed to load data: ${(err as Error).message}`, 'error');
      }
    };
    doBootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch repos ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort: `${sort.col}:${sort.dir}`,
    });
    Object.entries(filters).forEach(([k, v]) => params.set(k, v));
    api.fetchRepos(params)
      .then((payload) => { setRows(payload.data); setTotal(payload.total); })
      .catch((err: Error) => { setFetchError(err.message); addToast(`Failed to load repos: ${err.message}`, 'error'); })
      .finally(() => setLoading(false));
  }, [page, sort, filters, api]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch custom columns ───────────────────────────────────────────────────
  useEffect(() => {
    api.fetchCustomColumns()
      .then(setCustomColumns)
      .catch((err: Error) => addToast(`Failed to load custom columns: ${err.message}`, 'error'));
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) {
      localStorage.setItem('structable:column-widths', JSON.stringify(columnWidths));
    }
  }, [columnWidths]);

  useEffect(() => {
    localStorage.setItem('structable:cell-notes', JSON.stringify(cellNotes));
  }, [cellNotes]);

  // ── Reset menu modes when menu closes ─────────────────────────────────────
  useEffect(() => {
    if (!openMenuColumn) {
      setAddingColAfter(null);
      setNewColName('');
      setNewColId('');
      setNewColExpr('');
    }
    setHeaderMenuMode('menu');
  }, [openMenuColumn]);

  // ── Column geometry ────────────────────────────────────────────────────────
  const columns = useMemo<Column[]>(() => {
    if (rows.length === 0) return [];
    const base = deriveColumns(rows[0]);
    const result = [...base];
    for (const cc of customColumns) {
      const afterIdx = cc.position_after ? result.findIndex((c) => c.id === cc.position_after) : -1;
      result.splice(afterIdx >= 0 ? afterIdx + 1 : result.length, 0, {
        id: `custom:${cc.id}`,
        label: cc.label ?? cc.name,
        width: 150,
        minWidth: 60,
      });
    }
    if (columnOrder.length > 0) {
      const map = new Map(result.map((c) => [c.id, c]));
      const ordered: Column[] = [];
      const seen = new Set<string>();
      for (const id of columnOrder) {
        const col = map.get(id);
        if (col) { ordered.push(col); seen.add(id); }
      }
      for (const col of result) { if (!seen.has(col.id)) ordered.push(col); }
      return ordered;
    }
    return result;
  }, [rows, customColumns, columnOrder]);

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
    const param = colFilterParam(openMenuColumn);
    if (param) setFilterDraft((prev) => ({ ...prev, [openMenuColumn]: filters[param] ?? '' }));
  }, [openMenuColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedRows = useMemo(
    () => new Set(selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[1])),
    [selectedKeys],
  );
  const selectedCols = useMemo(() => new Set([
    ...selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[2]),
    ...selectedKeys.filter((k) => k.startsWith('header:')).map((k) => k.split(':')[1]),
  ]), [selectedKeys]);

  const allLeafColumns = useMemo(() => getLeafColumns(columns), [columns]);
  const visibleLeafColumns = useMemo(
    () => allLeafColumns.filter((c) => !hiddenSet.has(c.id)),
    [allLeafColumns, hiddenSet],
  );
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

  const compiledExprs = useMemo(() => {
    const map = new Map<string, (row: RepoRow) => unknown>();
    for (const cc of customColumns) {
      if (cc.expression?.trim()) {
        try {
          // eslint-disable-next-line no-new-func
          map.set(`custom:${cc.id}`, new Function('row', `"use strict"; return (${cc.expression})`) as (row: RepoRow) => unknown);
        } catch { /* invalid expression */ }
      }
    }
    return map;
  }, [customColumns]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const selectKey = useCallback((key: string, multi: boolean, shift?: boolean) => {
    const pos = keyToCursor(key, visibleLeafColumns);
    if (shift && anchorPosRef.current && pos) {
      const anchor = anchorPosRef.current;
      const newKeys: string[] = [];
      for (let r = Math.min(anchor.row, pos.row); r <= Math.max(anchor.row, pos.row); r++) {
        for (let c = Math.min(anchor.col, pos.col); c <= Math.max(anchor.col, pos.col); c++) {
          const k = cursorToKey({ row: r, col: c }, visibleLeafColumns, leafHeaderKey, rows.length);
          if (k) newKeys.push(k);
        }
      }
      setSelectedKeys(newKeys);
      setCursorPos(pos);
    } else {
      setSelectedKeys((prev) => {
        const has = prev.includes(key);
        if (multi) return has ? prev.filter((k) => k !== key) : [...prev, key];
        return has ? [] : [key];
      });
      if (!multi) anchorPosRef.current = pos;
      setCursorPos(pos);
    }
    wrapperRef.current?.focus();
  }, [visibleLeafColumns, leafHeaderKey, rows.length]);

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const cur = cursorPos ?? (rows.length > 0 && visibleLeafColumns.length > 0 ? { row: 0, col: 0 } : null);
    if (!cur) return;
    let { row, col } = cur;
    if (e.key === 'ArrowUp')    { if (row > 0) row--; else if (row === 0) row = -1; }
    if (e.key === 'ArrowDown')  { if (row === -1) row = 0; else if (row < rows.length - 1) row++; }
    if (e.key === 'ArrowLeft')  { if (col > 0) col--; }
    if (e.key === 'ArrowRight') { if (col < visibleLeafColumns.length - 1) col++; }
    const newPos = { row, col };
    setCursorPos(newPos);
    const key = cursorToKey(newPos, visibleLeafColumns, leafHeaderKey, rows.length);
    if (key) setSelectedKeys([key]);
  };

  useEffect(() => {
    if (!cursorPos) return;
    const key = cursorToKey(cursorPos, visibleLeafColumns, leafHeaderKey, rows.length);
    if (!key) return;
    const el = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursorPos]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (col: string, dir: 'asc' | 'desc') => {
    setSort({ col, dir });
    setPage(1);
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  };

  const applyFilter = (colId: string) => {
    const param = colFilterParam(colId);
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
    const param = colFilterParam(colId);
    if (!param) return;
    setFilters((prev) => { const { [param]: _, ...rest } = prev; return rest; });
    setFilterDraft((prev) => { const { [colId]: _, ...rest } = prev; return rest; });
    setPage(1);
  };

  const hideColumns = useCallback((ids: string[]) => {
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
    api.removeHiddenColumn(id);
  };
  const showAllColumns = () => {
    hiddenColumns.forEach((id) => api.removeHiddenColumn(id));
    setHiddenColumns([]);
    setOpenMenuColumn(null);
  };

  const hideRows = useCallback((repoIds: number[]) => {
    repoIds.forEach((id) => api.addHiddenRow(id));
    setHiddenRepoIds((prev) => new Set([...prev, ...repoIds]));
    setRows((prev) => prev.filter((r) => !repoIds.includes(Number(r['github_id'] ?? 0))));
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

  const createCustomColumn = async (afterColId: string) => {
    if (!newColName.trim()) return;
    try {
      const derivedId = newColName.trim().toLowerCase().replace(/\s+/g, '_');
      const created = await api.createCustomColumn({
        name: newColId.trim() || derivedId,
        label: newColName.trim(),
        expression: newColExpr.trim() || null,
        position_after: afterColId,
      });
      setCustomColumns((prev) => [...prev, created]);
      setNewColName(''); setNewColId(''); setNewColExpr('');
      setAddingColAfter(null);
      setOpenMenuColumn(null);
      setMenuAnchor(null);
    } catch (err) {
      addToast(`Failed to create column: ${(err as Error).message}`, 'error');
    }
  };

  const deleteCustomColumn = async (colId: string) => {
    const id = parseInt(colId.replace('custom:', ''), 10);
    api.deleteCustomColumn(id);
    setCustomColumns((prev) => prev.filter((c) => c.id !== id));
    setHiddenColumns((prev) => prev.filter((c) => c !== colId));
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  };

  const handleFlagsChange = useCallback((toSet: Record<string, string>, toDelete: string[]) => {
    setCellFlags((prev) => {
      const next = { ...prev, ...toSet };
      toDelete.forEach((k) => delete next[k]);
      return next;
    });
    Object.entries(toSet).forEach(([key, color]) => api.upsertFlag(key, color));
    toDelete.forEach((key) => api.deleteFlag(key));
  }, [api]);

  const saveComment = async (targets: CellTarget[], body: string) => {
    for (const { repoId, colId } of targets) {
      const noteKey = `${repoId}:${colId}`;
      if (!body.trim()) {
        const existing = cellComments[noteKey];
        if (existing) {
          api.deleteComment(existing.id);
          setCellComments((prev) => { const { [noteKey]: _, ...rest } = prev; return rest; });
        }
      } else {
        try {
          const saved = await api.upsertComment(repoId, colId, body);
          setCellComments((prev) => ({ ...prev, [noteKey]: { id: saved.id, body: saved.body } }));
        } catch (err) {
          addToast(`Failed to save comment: ${(err as Error).message}`, 'error');
        }
      }
    }
  };

  const saveHeaderComment = async (colId: string, body: string) => {
    const noteKey = `header:${colId}`;
    if (!body.trim()) {
      const existing = cellComments[noteKey];
      if (existing) {
        api.deleteComment(existing.id);
        setCellComments((prev) => { const { [noteKey]: _, ...rest } = prev; return rest; });
      }
    } else {
      try {
        const saved = await api.upsertComment(0, colId, body);
        setCellComments((prev) => ({ ...prev, [noteKey]: { id: saved.id, body: saved.body } }));
      } catch (err) {
        addToast(`Failed to save comment: ${(err as Error).message}`, 'error');
      }
    }
  };

  const saveNote = (keys: string[], text: string) => {
    setCellNotes((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { if (text.trim()) next[k] = text.trim(); else delete next[k]; });
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: '1rem', opacity: 0.6 }}>Loading…</div>;
  if (fetchError && rows.length === 0) return <div style={{ padding: '1rem', color: 'red' }}>Error: {fetchError}</div>;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
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
                  ).filter((id) => id !== PINNED_COL);
                  const selectedHeaderLeafIds = selectedKeys
                    .filter((k) => k.startsWith('header:'))
                    .map((k) => k.split(':')[1])
                    .filter((id) => id !== PINNED_COL && !hiddenSet.has(id) && allLeafColumns.some((c) => c.id === id));
                  const allColsToHide = [...new Set([...leafIdsToHide, ...selectedHeaderLeafIds])];
                  const showMenu = leafIdsToHide.length > 0 || isLeaf;
                  const isSticky = column.id === PINNED_COL;
                  const colHasFilter = () => {
                    const p = colFilterParam(column.id);
                    return !!p && !!filters[p];
                  };

                  return (
                    <th
                      key={headerKey}
                      colSpan={colSpan}
                      rowSpan={rowSpan}
                      data-key={headerKey}
                      draggable={isLeaf && column.id !== PINNED_COL}
                      onDragStart={(e) => {
                        dragColRef.current = column.id;
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        if (!dragColRef.current || dragColRef.current === column.id) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverCol(column.id);
                      }}
                      onDragLeave={() => setDragOverCol((prev) => prev === column.id ? null : prev)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragColRef.current;
                        dragColRef.current = null;
                        setDragOverCol(null);
                        if (!from || from === column.id) return;
                        const ids = allLeafColumns.map((c) => c.id);
                        const next = ids.filter((id) => id !== from);
                        const toIdx = next.indexOf(column.id);
                        if (toIdx === -1) return;
                        next.splice(toIdx, 0, from);
                        setColumnOrder(next);
                        localStorage.setItem('structable:column-order', JSON.stringify(next));
                      }}
                      onDragEnd={() => { dragColRef.current = null; setDragOverCol(null); }}
                      className={[
                        isHeaderSelected ? 'header-selected' : (isLeaf && selectedCols.has(column.id) ? 'col-highlight' : ''),
                        isSticky ? 'sticky-col' : '',
                        cellFlags[`header:${column.id}`] ? `flag-${cellFlags[`header:${column.id}`]}` : '',
                        dragOverCol === column.id ? 'col-drag-over' : '',
                      ].filter(Boolean).join(' ') || undefined}
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
                        <span className="col-label">
                          {column.label}
                          {sort.col === column.id && (
                            <span className="sort-indicator">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                          {isLeaf && colHasFilter() && (
                            <span className="filter-indicator" title="Filtered">●</span>
                          )}
                        </span>
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
                                onFlagsChange={handleFlagsChange}
                                addingColAfter={addingColAfter}
                                newColName={newColName}
                                newColId={newColId}
                                newColExpr={newColExpr}
                                setFilterDraft={setFilterDraft}
                                setNewColName={setNewColName}
                                setNewColId={setNewColId}
                                setNewColExpr={setNewColExpr}
                                draftText={draftText}
                                setDraftText={setDraftText}
                                headerNoteText={cellNotes[`header:${column.id}`]}
                                headerCommentBody={cellComments[`header:${column.id}`]?.body}
                                onSetMode={setHeaderMenuMode}
                                onSort={handleSort}
                                onApplyFilter={applyFilter}
                                onClearFilter={clearColFilter}
                                onHide={hideColumns}
                                onAddColClick={(colId) => setAddingColAfter(colId || null)}
                                onCreateCol={createCustomColumn}
                                onDeleteCol={deleteCustomColumn}
                                onSaveNote={saveNote}
                                onSaveComment={saveHeaderComment}
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
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row: RepoRow, rowIndex: number) => {
              const repoId = Number(row['github_id'] ?? 0);
              if (hiddenRepoIds.has(repoId)) return null;
              return (
                <tr key={rowIndex}>
                  {visibleLeafColumns.map((col: Column) => {
                    const bodyKey = `cell:${rowIndex}:${col.id}`;
                    const noteKey = `${repoId}:${col.id}`;
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
                          col.id === PINNED_COL ? 'sticky-col' : '',
                          cellFlags[noteKey] ? `flag-${cellFlags[noteKey]}` : '',
                        ].filter(Boolean).join(' ') || undefined}
                        onClick={(e) => selectKey(bodyKey, e.metaKey || e.ctrlKey, e.shiftKey)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const isSelected = selectedSet.has(bodyKey);
                          const selBodyKeys = selectedKeys.filter((k) => k.startsWith('cell:'));
                          const targets: CellTarget[] = (isSelected && selBodyKeys.length > 1)
                            ? selBodyKeys.map((k) => {
                                const p = k.split(':');
                                return {
                                  repoId: Number(rows[parseInt(p[1], 10)]?.['github_id'] ?? 0),
                                  colId: p[2],
                                };
                              })
                            : [{ repoId, colId: col.id }];
                          setCellMenu({ anchor: { top: e.clientY + window.scrollY, left: e.clientX + window.scrollX }, targets });
                          setCellMenuMode('menu');
                          setDraftText('');
                        }}
                      >
                        <CellContent
                          row={row}
                          colId={col.id}
                          compiledExpr={compiledExprs.get(col.id)}
                          hasNote={!!cellNotes[noteKey]}
                          hasComment={!!cellComments[noteKey]?.body}
                        />
                        <div
                          className="resizer"
                          onPointerDown={(e) => { e.stopPropagation(); handleResizerPointerDown(e, col.id); }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-note">
        <span>{total.toLocaleString()} repos — page {page} of {totalPages}</span>
        <span style={{ marginLeft: '1rem' }}>
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</button>
          {' '}
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</button>
        </span>
        {hiddenRepoIds.size > 0 && (
          <span style={{ marginLeft: '1rem', color: '#64748b', fontSize: '0.81rem' }}>
            {hiddenRepoIds.size} row{hiddenRepoIds.size !== 1 ? 's' : ''} hidden
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
      {cellMenu && (
        <ContextMenu
          kind="cell"
          anchor={cellMenu.anchor}
          targets={cellMenu.targets}
          mode={cellMenuMode}
          draftText={draftText}
          cellFlags={cellFlags}
          onFlagsChange={handleFlagsChange}
          cellNotes={cellNotes}
          cellComments={cellComments}
          setDraftText={setDraftText}
          onSetMode={setCellMenuMode}
          onSaveNote={saveNote}
          onSaveComment={saveComment}
          onHideCols={hideColumns}
          onHideRows={hideRows}
          onClose={() => setCellMenu(null)}
        />
      )}
    </>
  );
}
