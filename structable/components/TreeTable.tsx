'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const PINNED_COL = 'name';

type ColumnMeta = {
  width?: number;
  label?: string;
};

const COLUMNS: Record<string, ColumnMeta> = {
  name:            { width: 220, label: 'Repo' },
  description:     { width: 320 },
  owner_login:     { width: 130 },
  language:        { width: 120 },
  license:         { width: 120 },
  stars:           { width: 90 },
  forks:           { width: 80 },
  open_issues:     { width: 80 },
  size:            { width: 80 },
  stars_now:       { width: 90 },
  stars_diff_6h:   { width: 80 },
  stars_diff_12h:  { width: 80 },
  stars_diff_24h:  { width: 80 },
  stars_diff_48h:  { width: 80 },
  stars_diff_5d:   { width: 80 },
  stars_diff_7d:   { width: 80 },
  stars_diff_10d:  { width: 80 },
  stars_diff_14d:  { width: 80 },
  stars_diff_20d:  { width: 80 },
  stars_diff_30d:  { width: 80 },
  pushed_at:       { width: 170 },
  created_at:      { width: 170 },
  updated_at:      { width: 170 },
  visibility:      { width: 100 },
  archived:        { width: 80 },
  disabled:        { width: 80 },
  topics:          { width: 200 },
};

type Column = {
  id: string;
  label: string;
  width?: number;
  minWidth?: number;
  subColumns?: Column[];
};

type HeaderCell = {
  column: Column;
  colSpan: number;
  rowSpan: number;
  depth: number;
};

type HeaderTraversalResult = {
  colSpan: number;
  rowSpan: number;
  visible: boolean;
};

type RepoRow = Record<string, unknown>;

type PagedResponse = {
  data: RepoRow[];
  total: number;
  page: number;
  per_page: number;
};

type CustomColumnDef = {
  id: number;
  name: string;
  label: string | null;
  expression: string | null;
  position_after: string | null;
};

type ColType = 'numeric' | 'text' | 'categorical' | 'boolean';

function colType(key: string): ColType | null {
  if (key.endsWith('_at') || key === 'id' || key === 'gh_id') return null;
  if (key === 'archived' || key === 'disabled') return 'boolean';
  if (['name', 'description'].includes(key)) return 'text';
  if (['language', 'license', 'visibility', 'owner_login'].includes(key)) return 'categorical';
  if (key === 'stars' || key === 'forks' || key === 'open_issues' || key === 'size' ||
      key === 'stars_now' || key.startsWith('stars_diff_')) return 'numeric';
  return null;
}

function colFilterParam(key: string): string | null {
  const t = colType(key);
  if (t === 'text') return 'q';
  if (t === 'numeric') return `${key}_min`;
  if (t === 'categorical' || t === 'boolean') return key;
  return null;
}

function colFilterPlaceholder(key: string): string {
  const t = colType(key);
  if (t === 'numeric') return 'Min value…';
  if (t === 'text') return 'Search name / description…';
  if (t === 'categorical') return 'Exact value (comma = OR)…';
  return 'Value…';
}

function labelFor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveColumns(row: RepoRow): Column[] {
  const keys = Object.keys(row);
  const sorted = [
    ...(keys.includes(PINNED_COL) ? [PINNED_COL] : []),
    ...keys.filter((k) => k !== PINNED_COL),
  ];
  return sorted.map((key) => ({
    id: key,
    label: COLUMNS[key]?.label ?? labelFor(key),
    width: COLUMNS[key]?.width ?? 120,
    minWidth: 60,
  }));
}

function getLeafColumns(columnList: Column[]): Column[] {
  return columnList.flatMap((col) =>
    col.subColumns ? getLeafColumns(col.subColumns) : [col],
  );
}

function getVisibleLeafColumns(column: Column, hiddenSet: Set<string>): Column[] {
  if (!column.subColumns || column.subColumns.length === 0) {
    return hiddenSet.has(column.id) ? [] : [column];
  }
  return column.subColumns.flatMap((child) => getVisibleLeafColumns(child, hiddenSet));
}

function getColumnDepth(columnList: Column[]): number {
  return columnList.reduce((depth, col) => {
    if (!col.subColumns) return Math.max(depth, 1);
    return Math.max(depth, 1 + getColumnDepth(col.subColumns));
  }, 0);
}

function buildHeaderRows(columnList: Column[], maxDepth: number, hiddenSet: Set<string>) {
  const rows: HeaderCell[][] = Array.from({ length: maxDepth }, () => [] as HeaderCell[]);

  function traverse(column: Column, depth: number): HeaderTraversalResult {
    const isLeaf = !column.subColumns || column.subColumns.length === 0;
    if (isLeaf) {
      if (hiddenSet.has(column.id)) return { colSpan: 0, rowSpan: 0, visible: false };
      const rowSpan = maxDepth - depth + 1;
      rows[depth - 1].push({ column, colSpan: 1, rowSpan, depth });
      return { colSpan: 1, rowSpan, visible: true };
    }
    const childResults = column.subColumns!.map((child) => traverse(child, depth + 1));
    const colSpan = childResults.reduce((sum, r) => sum + (r.visible ? r.colSpan : 0), 0);
    if (colSpan === 0) return { colSpan: 0, rowSpan: 0, visible: false };
    rows[depth - 1].push({ column, colSpan, rowSpan: 1, depth });
    return { colSpan, rowSpan: 1, visible: true };
  }

  columnList.forEach((col) => traverse(col, 1));
  return rows.map((row) => row.filter((cell) => cell.colSpan > 0));
}

function formatCell(value: unknown, columnId: string): string {
  if (value === null || value === undefined) return '-';
  if (columnId.endsWith('_at')) {
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function keyToCursor(key: string, leafCols: Column[]): { row: number; col: number } | null {
  if (key.startsWith('header:')) {
    const colId = key.split(':')[1];
    const idx = leafCols.findIndex((c) => c.id === colId);
    return idx >= 0 ? { row: -1, col: idx } : null;
  }
  if (key.startsWith('cell:')) {
    const parts = key.split(':');
    const rowIdx = parseInt(parts[1], 10);
    const colId = parts[2];
    const idx = leafCols.findIndex((c) => c.id === colId);
    return idx >= 0 ? { row: rowIdx, col: idx } : null;
  }
  return null;
}

function cursorToKey(
  pos: { row: number; col: number },
  leafCols: Column[],
  leafHeaderKey: Map<string, string>,
  numBodyRows: number,
): string | null {
  if (pos.col < 0 || pos.col >= leafCols.length) return null;
  const col = leafCols[pos.col];
  if (pos.row === -1) return leafHeaderKey.get(col.id) ?? null;
  if (pos.row < 0 || pos.row >= numBodyRows) return null;
  return `cell:${pos.row}:${col.id}`;
}

export default function TreeTable() {
  const [rows, setRows] = useState<RepoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [cursorPos, setCursorPos] = useState<{ row: number; col: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('structable:hidden-columns') ?? '[]'); } catch { return []; }
  });
  const [openMenuColumn, setOpenMenuColumn] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('structable:column-widths') ?? '{}'); } catch { return {}; }
  });
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'stars_diff_14d', dir: 'desc' });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});
  const [customColumns, setCustomColumns] = useState<CustomColumnDef[]>([]);
  const [addingColAfter, setAddingColAfter] = useState<string | null>(null);
  const [newColName, setNewColName] = useState('');
  const [newColId, setNewColId] = useState('');
  const [newColExpr, setNewColExpr] = useState('');

  const [cellMenu, setCellMenu] = useState<{ anchor: { top: number; left: number }; rowKey: string; colId: string } | null>(null);
  const [cellMenuMode, setCellMenuMode] = useState<'menu' | 'note' | 'comment'>('menu');
  const [draftText, setDraftText] = useState('');
  const [cellNotes, setCellNotes] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('structable:cell-notes') ?? '{}'); } catch { return {}; }
  });
  const [cellComments, setCellComments] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('structable:cell-comments') ?? '{}'); } catch { return {}; }
  });

  const resizingRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  const perPage = 50;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort: `${sort.col}:${sort.dir}` });
    Object.entries(filters).forEach(([k, v]) => params.set(k, v));
    fetch(`${API_BASE}/repos?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PagedResponse>;
      })
      .then((payload) => {
        setRows(payload.data);
        setTotal(payload.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, sort, filters]);

  // Fetch custom column definitions once on mount
  useEffect(() => {
    fetch(`${API_BASE}/custom-columns`)
      .then((r) => r.json() as Promise<CustomColumnDef[]>)
      .then(setCustomColumns)
      .catch(console.error);
  }, []);

  // Reset add-column form when the menu closes
  useEffect(() => {
    if (!openMenuColumn) {
      setAddingColAfter(null);
      setNewColName('');
      setNewColId('');
      setNewColExpr('');
    }
  }, [openMenuColumn]);

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
    return result;
  }, [rows, customColumns]);

  useEffect(() => {
    if (columns.length === 0) return;
    setColumnWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const col of columns) {
        if (!(col.id in next)) {
          next[col.id] = col.width ?? 120;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [columns]);

  useEffect(() => {
    localStorage.setItem('structable:hidden-columns', JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);

  useEffect(() => {
    if (Object.keys(columnWidths).length === 0) return;
    localStorage.setItem('structable:column-widths', JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    localStorage.setItem('structable:cell-notes', JSON.stringify(cellNotes));
  }, [cellNotes]);

  useEffect(() => {
    localStorage.setItem('structable:cell-comments', JSON.stringify(cellComments));
  }, [cellComments]);

  useEffect(() => {
    if (!cellMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.cell-context-menu')) setCellMenu(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [cellMenu]);

  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const selectedRows = useMemo(() => new Set(
    selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[1]),
  ), [selectedKeys]);

  const selectedCols = useMemo(() => new Set([
    ...selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[2]),
    ...selectedKeys.filter((k) => k.startsWith('header:')).map((k) => k.split(':')[1]),
  ]), [selectedKeys]);

  const allLeafColumns = useMemo(() => getLeafColumns(columns), [columns]);
  const visibleLeafColumns = useMemo(
    () => allLeafColumns.filter((col) => !hiddenSet.has(col.id)),
    [allLeafColumns, hiddenSet],
  );
  const headerRows = useMemo(
    () => buildHeaderRows(columns, getColumnDepth(columns), hiddenSet),
    [columns, hiddenSet],
  );
  const resizerTargetByColumn = useMemo(() => {
    const map = new Map<string, string>();
    function traverse(column: Column) {
      const leaves = getVisibleLeafColumns(column, hiddenSet);
      if (leaves.length > 0) map.set(column.id, leaves[leaves.length - 1].id);
      column.subColumns?.forEach(traverse);
    }
    columns.forEach(traverse);
    return map;
  }, [columns, hiddenSet]);

  const leafHeaderKey = useMemo(() => {
    const map = new Map<string, string>();
    headerRows.forEach((row) => {
      row.forEach(({ column, depth }) => {
        if ((!column.subColumns || column.subColumns.length === 0) && !map.has(column.id)) {
          map.set(column.id, `header:${column.id}:${depth}`);
        }
      });
    });
    return map;
  }, [headerRows]);

  // Sync filter draft value when a column menu opens
  useEffect(() => {
    if (!openMenuColumn) return;
    const param = colFilterParam(openMenuColumn);
    if (param) setFilterDraft((prev) => ({ ...prev, [openMenuColumn]: filters[param] ?? '' }));
  }, [openMenuColumn]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const colHasFilter = (colId: string) => {
    const param = colFilterParam(colId);
    return !!param && !!filters[param];
  };

  // Compile JS expressions for custom columns once; evaluate per cell
  const compiledExprs = useMemo(() => {
    const map = new Map<string, (row: RepoRow) => unknown>();
    for (const cc of customColumns) {
      if (cc.expression?.trim()) {
        try {
          // eslint-disable-next-line no-new-func
          map.set(`custom:${cc.id}`, new Function('row', `"use strict"; return (${cc.expression})`) as (row: RepoRow) => unknown);
        } catch { /* invalid expression — key absent, cell shows '-' */ }
      }
    }
    return map;
  }, [customColumns]);

  const createCustomColumn = async (afterColId: string) => {
    if (!newColName.trim()) return;
    try {
      const derivedId = newColName.trim().toLowerCase().replace(/\s+/g, '_');
      const res = await fetch(`${API_BASE}/custom-columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newColId.trim() || derivedId,
          label: newColName.trim(),
          expression: newColExpr.trim() || null,
          position_after: afterColId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json() as CustomColumnDef;
      setCustomColumns((prev) => [...prev, created]);
      setNewColName('');
      setNewColId('');
      setNewColExpr('');
      setAddingColAfter(null);
      setOpenMenuColumn(null);
      setMenuAnchor(null);
    } catch (err) { console.error('Failed to create custom column:', err); }
  };

  const deleteCustomColumn = async (colId: string) => {
    const id = parseInt(colId.replace('custom:', ''), 10);
    try {
      const res = await fetch(`${API_BASE}/custom-columns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCustomColumns((prev) => prev.filter((c) => c.id !== id));
      setHiddenColumns((prev) => prev.filter((c) => c !== colId));
      setOpenMenuColumn(null);
      setMenuAnchor(null);
    } catch (err) { console.error('Failed to delete custom column:', err); }
  };

  const showColumn = (id: string) => setHiddenColumns((prev) => prev.filter((c) => c !== id));
  const showAllColumns = () => { setHiddenColumns([]); setOpenMenuColumn(null); };

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

  useEffect(() => {
    if (!openMenuColumn) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.column-menu') && !t.closest('.column-action-button')) {
        setOpenMenuColumn(null);
        setMenuAnchor(null);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [openMenuColumn]);

  const selectKey = (key: string, multi: boolean) => {
    setSelectedKeys((prev) => {
      const has = prev.includes(key);
      if (multi) return has ? prev.filter((k) => k !== key) : [...prev, key];
      return has ? [] : [key];
    });
    const pos = keyToCursor(key, visibleLeafColumns);
    setCursorPos(pos);
    wrapperRef.current?.focus();
  };

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

  // Scroll the focused cell into view after cursor moves
  useEffect(() => {
    if (!cursorPos) return;
    const key = cursorToKey(cursorPos, visibleLeafColumns, leafHeaderKey, rows.length);
    if (!key) return;
    const el = wrapperRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursorPos]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (loading) return <div style={{ padding: '1rem', opacity: 0.6 }}>Loading…</div>;
  if (error) return <div style={{ padding: '1rem', color: 'red' }}>Error: {error}</div>;

  return (
    <>
    <div ref={wrapperRef} className="tree-table-wrap" tabIndex={0} onKeyDown={handleTableKeyDown} style={{ outline: 'none' }}>
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
                const isLeaf = !column.subColumns || column.subColumns.length === 0;
                const leafIdsToHide = (isLeaf
                  ? (hiddenSet.has(column.id) ? [] : [column.id])
                  : getVisibleLeafColumns(column, hiddenSet).map((c) => c.id)
                ).filter((id) => id !== PINNED_COL);
                const showMenu = leafIdsToHide.length > 0 || isLeaf;
                const isSticky = column.id === PINNED_COL;

                return (
                  <th
                    key={headerKey}
                    colSpan={colSpan}
                    rowSpan={rowSpan}
                    data-key={headerKey}
                    className={[isHeaderSelected ? 'header-selected' : (isLeaf && selectedCols.has(column.id) ? 'col-highlight' : ''), isSticky ? 'sticky-col' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={(e) => selectKey(headerKey, e.metaKey || e.ctrlKey)}
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
                        {isLeaf && colHasFilter(column.id) && (
                          <span className="filter-indicator" title="Filtered">●</span>
                        )}
                      </span>
                      {showMenu ? (
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
                          {openMenuColumn === column.id && menuAnchor
                            ? createPortal(
                                <div className="column-menu" style={{ position: 'absolute', top: menuAnchor.top, left: menuAnchor.left, transform: 'translateX(-100%)' }}>
                                  {!column.id.startsWith('custom:') && (<>
                                    <div className="menu-section-label">Sort</div>
                                    <button type="button" className={sort.col === column.id && sort.dir === 'asc' ? 'menu-active' : ''} onClick={(e) => { e.stopPropagation(); handleSort(column.id, 'asc'); }}>↑ Ascending</button>
                                    <button type="button" className={sort.col === column.id && sort.dir === 'desc' ? 'menu-active' : ''} onClick={(e) => { e.stopPropagation(); handleSort(column.id, 'desc'); }}>↓ Descending</button>
                                    {isLeaf && colFilterParam(column.id) && (<>
                                      <div className="menu-divider" />
                                      <div className="menu-section-label">Filter</div>
                                      <div className="menu-filter">
                                        <input
                                          type={colType(column.id) === 'numeric' ? 'number' : 'text'}
                                          placeholder={colFilterPlaceholder(column.id)}
                                          value={filterDraft[column.id] ?? ''}
                                          onChange={(e) => setFilterDraft((prev) => ({ ...prev, [column.id]: e.target.value }))}
                                          onKeyDown={(e) => { if (e.key === 'Enter') applyFilter(column.id); }}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <button type="button" onClick={(e) => { e.stopPropagation(); applyFilter(column.id); }}>Apply</button>
                                      </div>
                                      {colHasFilter(column.id) && (
                                        <button type="button" className="menu-clear-filter" onClick={(e) => { e.stopPropagation(); clearColFilter(column.id); }}>✕ Clear filter</button>
                                      )}
                                    </>)}
                                  </>)}
                                  <div className="menu-divider" />
                                  {column.id.startsWith('custom:') ? (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); deleteCustomColumn(column.id); }}>Delete column</button>
                                  ) : (<>
                                    {addingColAfter === column.id ? (
                                      <div className="menu-add-col" onClick={(e) => e.stopPropagation()}>
                                        <input autoFocus placeholder="Column label…" value={newColName} onChange={(e) => setNewColName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createCustomColumn(column.id); if (e.key === 'Escape') setAddingColAfter(null); }} />
                                        <input placeholder={`ID (default: ${newColName.trim().toLowerCase().replace(/\s+/g, '_') || 'auto'})`} value={newColId} onChange={(e) => setNewColId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createCustomColumn(column.id); if (e.key === 'Escape') setAddingColAfter(null); }} />
                                        <input placeholder="JS expression (optional, e.g. row.stars/row.forks)…" value={newColExpr} onChange={(e) => setNewColExpr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createCustomColumn(column.id); }} />
                                        <div className="menu-add-col-actions">
                                          <button type="button" onClick={(e) => { e.stopPropagation(); createCustomColumn(column.id); }}>Create</button>
                                          <button type="button" onClick={(e) => { e.stopPropagation(); setAddingColAfter(null); setNewColName(''); setNewColId(''); setNewColExpr(''); }}>Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setAddingColAfter(column.id); }}>+ Add column to the right</button>
                                    )}
                                    {leafIdsToHide.length > 0 && (<>
                                      <div className="menu-divider" />
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setHiddenColumns((prev) => [...prev, ...leafIdsToHide.filter((id) => !prev.includes(id))]); setOpenMenuColumn(null); setMenuAnchor(null); }}>
                                        {isLeaf ? 'Hide column' : 'Hide group'}
                                      </button>
                                    </>)}
                                  </>)}
                                </div>,
                                document.body,
                              )
                            : null}
                        </span>
                      ) : null}
                    </div>
                    {resizerTargetId ? (
                      <div
                        className="resizer"
                        onPointerDown={(e) => { e.stopPropagation(); handleResizerPointerDown(e, resizerTargetId); }}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row: RepoRow, rowIndex: number) => (
            <tr key={rowIndex}>
              {visibleLeafColumns.map((col: Column) => {
                const bodyKey = `cell:${rowIndex}:${col.id}`;
                const noteKey = `${String(row[PINNED_COL] ?? rowIndex)}:${col.id}`;
                const hasNote = !!cellNotes[noteKey];
                const hasComment = !!cellComments[noteKey];
                return (
                  <td
                    key={bodyKey}
                    data-key={bodyKey}
                    className={[
                      selectedSet.has(bodyKey) ? 'cell-selected' : [selectedRows.has(String(rowIndex)) ? 'row-highlight' : '', selectedCols.has(col.id) ? 'col-highlight' : ''].filter(Boolean).join(' '),
                      col.id === PINNED_COL ? 'sticky-col' : '',
                    ].filter(Boolean).join(' ') || undefined}
                    onClick={(e) => selectKey(bodyKey, e.metaKey || e.ctrlKey)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCellMenu({ anchor: { top: e.clientY + window.scrollY, left: e.clientX + window.scrollX }, rowKey: String(row[PINNED_COL] ?? rowIndex), colId: col.id });
                      setCellMenuMode('menu');
                      setDraftText('');
                    }}
                  >
                    {col.id === PINNED_COL
                      ? <a href={`https://github.com/${String(row[col.id])}`} target="_blank" rel="noopener noreferrer">{String(row[col.id] ?? '-')}</a>
                      : col.id.startsWith('custom:')
                        ? (() => {
                            const fn = compiledExprs.get(col.id);
                            if (!fn) return '-';
                            try { const v = fn(row); return v != null ? String(v) : '-'; } catch { return '#ERR'; }
                          })()
                        : formatCell(row[col.id], col.id)}
                    {(hasNote || hasComment) && (
                      <span
                        className="cell-dot"
                        title={[hasNote && 'Note', hasComment && 'Comment'].filter(Boolean).join(' · ')}
                      />
                    )}
                    <div
                      className="resizer"
                      onPointerDown={(e) => { e.stopPropagation(); handleResizerPointerDown(e, col.id); }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
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
      {hiddenColumns.length > 0 ? (
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
      ) : null}
    </div>
    {cellMenu && createPortal(
      <div
        className="column-menu cell-context-menu"
        style={{ position: 'absolute', top: cellMenu.anchor.top, left: cellMenu.anchor.left }}
      >
        {cellMenuMode === 'menu' && (<>
          <button type="button" onClick={(e) => { e.stopPropagation(); setCellMenuMode('note'); setDraftText(cellNotes[`${cellMenu.rowKey}:${cellMenu.colId}`] ?? ''); }}>
            {cellNotes[`${cellMenu.rowKey}:${cellMenu.colId}`] ? 'Edit note' : 'Add note'}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setCellMenuMode('comment'); setDraftText(cellComments[`${cellMenu.rowKey}:${cellMenu.colId}`] ?? ''); }}>
            {cellComments[`${cellMenu.rowKey}:${cellMenu.colId}`] ? 'Edit comment' : 'Add comment'}
          </button>
        </>)}
        {(cellMenuMode === 'note' || cellMenuMode === 'comment') && (
          <div className="menu-add-col" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              rows={3}
              placeholder={cellMenuMode === 'note' ? 'Note…' : 'Comment…'}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
            <div className="menu-add-col-actions">
              <button type="button" onClick={(e) => {
                e.stopPropagation();
                const key = `${cellMenu.rowKey}:${cellMenu.colId}`;
                if (cellMenuMode === 'note') {
                  if (draftText.trim()) setCellNotes((prev) => ({ ...prev, [key]: draftText.trim() }));
                  else setCellNotes((prev) => { const { [key]: _, ...rest } = prev; return rest; });
                } else {
                  if (draftText.trim()) setCellComments((prev) => ({ ...prev, [key]: draftText.trim() }));
                  else setCellComments((prev) => { const { [key]: _, ...rest } = prev; return rest; });
                }
                setCellMenu(null);
              }}>Save</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setCellMenuMode('menu'); }}>Back</button>
            </div>
          </div>
        )}
      </div>,
      document.body,
    )}
    </>
  );
}
