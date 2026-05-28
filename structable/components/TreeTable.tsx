'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { getSyncClient, SyncClient } from '../services/syncClient';
import { localStore } from '../services/localStore';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import { useTableSelection } from '../hooks/useTableSelection';
import ContextMenu from './ContextMenu';
import CellContent from './CellContent';
import SyncIndicator from './SyncIndicator';
import { colFilterParam } from '../utils/columnFilters';

import type { ApiCustomColumn, ApiRemark, CellTarget, PagedResponse, RemarkTarget, RepoRow } from '../types/table';

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PINNED_COL = 'name';

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

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TreeTable() {
  const [api, setApi] = useState<SyncClient | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);

  useEffect(() => {
    getSyncClient()
      .then(setApi)
      .catch((err) => toast.error(`Sync init failed: ${errMsg(err)}`));
  }, []);

  useEffect(() => {
    if (!api) return;
    const sub = api.queueLength$.subscribe(setPendingUploads);
    return () => sub.unsubscribe();
  }, [api]);

  // ── Repo data ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<RepoRow[]>([]);
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

  // ── Column prefs (widths + order) ─────────────────────────────────────────
  const { columnWidths, setColumnWidths, columnOrder, reorderColumns } = useColumnPrefs();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Column state ───────────────────────────────────────────────────────────
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
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

  // ── Cell remarks (unified notes + comments) ───────────────────────────────
  const [cellRemarks, setCellRemarks] = useState<Record<string, ApiRemark[]>>({});
  const [cellFlags, setCellFlags] = useState<Record<string, string>>({});

  // ── Cell menu state ────────────────────────────────────────────────────────
  const [cellMenu, setCellMenu] = useState<{ anchor: { top: number; left: number }; targets: CellTarget[] } | null>(null);
  const [cellMenuMode, setCellMenuMode] = useState<'menu' | 'note' | 'comment' | 'flag'>('menu');
  const [draftText, setDraftText] = useState('');

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

        // One-time V2 migration: localStorage flags/hidden-cols → server
        if (!localStore.isMigratedV2()) {
          const localFlags  = localStore.getLegacyCellFlags();
          const localHidden = localStore.getLegacyHiddenCols();

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
          localStore.setMigratedV2();
        } else {
          setHiddenColumns(hiddenColsData.map((c) => c.column_id));
        }

        // One-time V3 migration: localStorage cell-notes → server remarks
        if (!localStore.isMigratedV3()) {
          const localNotes = localStore.getLegacyCellNotes();
          for (const [key, body] of Object.entries(localNotes)) {
            if (!body.trim()) continue;
            let target: RemarkTarget;
            if (key.startsWith('header:')) {
              target = { repo_id: 0, column_id: key.slice('header:'.length) };
            } else {
              const colonIdx = key.indexOf(':');
              target = { repo_id: Number(key.slice(0, colonIdx)), column_id: key.slice(colonIdx + 1) };
            }
            api.upsertRemark(null, 'note', body, [target]);
          }
          localStore.setMigratedV3();
        }

        setCellFlags(flagMap);
        setHiddenRepoIds(new Set(hiddenRowsData.map((r) => r.repo_id)));

        // Build cellRemarks: each remark appears in every target cell's list
        const remarkMap: Record<string, ApiRemark[]> = {};
        for (const r of remarksData) {
          for (const t of r.targets) {
            const key = `${t.repo_id}:${t.column_id}`;
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

  // ── Fetch repos (with abort to prevent race conditions) ───────────────────
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
      sort: `${sort.col}:${sort.dir}`,
    });
    Object.entries(filters).forEach(([k, v]) => params.set(k, v));
    api.fetchRepos(params, aborter.signal)
      .then((payload: PagedResponse) => {
        setRows(payload.data);
        setTotal(payload.total);
        if (!aborter.signal.aborted) { setLoading(false); setFetchError(null); }
      })
      .catch((err: Error) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = errMsg(err);
        setFetchError(msg);
        toast.error(`Failed to load repos: ${msg}`, { id: 'fetch-repos-error' });
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
  }, [page, sort, filters, api, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch custom columns ───────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return;
    api.fetchCustomColumns()
      .then(setCustomColumns)
      .catch((err: unknown) => {
        toast.error(`Failed to load custom columns: ${errMsg(err)}`, { id: 'fetch-custom-cols-error' });
        // Retry forever
        customColsRetryTimerRef.current = setTimeout(() => {
          customColsRetryTimerRef.current = null;
          setCustomColsRetryKey((k) => k + 1);
        }, 1_000);
      });
    return () => {
      if (customColsRetryTimerRef.current !== null) { clearTimeout(customColsRetryTimerRef.current); customColsRetryTimerRef.current = null; }
    };
  }, [api, customColsRetryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset column menu modes when it closes ─────────────────────────────────
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

  const {
    selectedKeys, setSelectedKeys,
    cursorPos,
    selectedSet, selectedRows, selectedCols,
    selectKey: selectKeyHook, moveCursor,
    cursorToKey: cursorToKeyFn,
  } = useTableSelection(visibleLeafColumns, leafHeaderKey, rows.length);

  const selectKey = useCallback((key: string, multi: boolean, shift?: boolean) => {
    selectKeyHook(key, multi, shift);
    wrapperRef.current?.focus();
  }, [selectKeyHook]);

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

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    moveCursor(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
  };

  useEffect(() => {
    if (!cursorPos) return;
    const key = cursorToKeyFn(cursorPos);
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

  const hideRows = useCallback((repoIds: number[]) => {
    if (!api) return;
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

  const createCustomColumn = (afterColId: string) => {
    if (!newColName.trim() || !api) return;
    const derivedId = newColName.trim().toLowerCase().replace(/\s+/g, '_');
    const id = nanoid();
    const col: ApiCustomColumn = {
      id,
      name: newColId.trim() || derivedId,
      label: newColName.trim(),
      expression: newColExpr.trim() || null,
      position_after: afterColId,
    };
    setCustomColumns((prev) => [...prev, col]);
    api.createCustomColumn({
      name: col.name,
      label: col.label,
      expression: col.expression,
      position_after: col.position_after,
    }, id);
    setNewColName(''); setNewColId(''); setNewColExpr('');
    setAddingColAfter(null);
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  };

  const deleteCustomColumn = (colId: string) => {
    if (!api) return;
    const id = colId.replace('custom:', '');
    api.deleteCustomColumn(id);
    setCustomColumns((prev) => prev.filter((c) => c.id !== id));
    setHiddenColumns((prev) => prev.filter((c) => c !== colId));
    setOpenMenuColumn(null);
    setMenuAnchor(null);
  };

  const handleFlagsChange = useCallback((toSet: Record<string, string>, toDelete: string[]) => {
    if (!api) return;
    setCellFlags((prev) => {
      const next = { ...prev, ...toSet };
      toDelete.forEach((k) => delete next[k]);
      return next;
    });
    Object.entries(toSet).forEach(([key, color]) => api.upsertFlag(key, color));
    toDelete.forEach((key) => api.deleteFlag(key));
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
            const key = `${t.repo_id}:${t.column_id}`;
            const filtered = (next[key] ?? []).filter((r) => r.id !== existingId);
            if (filtered.length > 0) next[key] = filtered; else delete next[key];
          }
          return next;
        });
      }
      return;
    }
    const rid = existingId ?? nanoid();
    // Optimistic update
    const optimistic: ApiRemark = { id: rid, body, kind, is_private: false, resolved_at: null, targets };
    setCellRemarks((prev) => {
      const next = { ...prev };
      for (const t of targets) {
        const key = `${t.repo_id}:${t.column_id}`;
        const others = (next[key] ?? []).filter((r) => r.id !== rid);
        next[key] = [...others, optimistic];
      }
      return next;
    });
    api.upsertRemark(rid, kind, body, targets);
  }, [api]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isDownloading = loading || bootstrapping;

  // Initial empty state: no data yet
  if (rows.length === 0 && !fetchError) {
    return (
      <>
        <SyncIndicator pendingUploads={pendingUploads} isDownloading={isDownloading} />
        {loading && <div style={{ padding: '1rem', opacity: 0.6 }}>Loading…</div>}
      </>
    );
  }
  if (rows.length === 0 && fetchError) {
    return (
      <>
        <SyncIndicator pendingUploads={pendingUploads} isDownloading={isDownloading} />
        <div style={{ padding: '1rem', color: 'red' }}>Error: {fetchError}</div>
      </>
    );
  }

  return (
    <>
      <SyncIndicator pendingUploads={pendingUploads} isDownloading={isDownloading} />
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
                          reorderColumns(from, column.id, allLeafColumns.map((c) => c.id));
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
                                  cellRemarks={cellRemarks}
                                  onFlagsChange={handleFlagsChange}
                                  onSaveRemark={saveRemark}
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
                                  onSetMode={setHeaderMenuMode}
                                  onSort={handleSort}
                                  onApplyFilter={applyFilter}
                                  onClearFilter={clearColFilter}
                                  onHide={hideColumns}
                                  onAddColClick={(colId) => setAddingColAfter(colId || null)}
                                  onCreateCol={createCustomColumn}
                                  onDeleteCol={deleteCustomColumn}
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
                            hasNote={cellRemarks[noteKey]?.some((r) => r.kind === 'note') ?? false}
                            hasComment={cellRemarks[noteKey]?.some((r) => r.kind === 'comment') ?? false}
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
    </>
  );
}
