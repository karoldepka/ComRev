'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ColumnMeta = {
  width?: number;
};

const COLUMNS: Record<string, ColumnMeta> = {
  name:            { width: 200 },
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

function labelFor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveColumns(row: RepoRow): Column[] {
  return Object.keys(row).map((key) => ({
    id: key,
    label: labelFor(key),
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

export default function TreeTable() {
  const [rows, setRows] = useState<RepoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [openMenuColumn, setOpenMenuColumn] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const resizingRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  const perPage = 50;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/repos?page=${page}&per_page=${perPage}&sort=stars_diff_24h:desc,stars:desc`)
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
  }, [page]);

  const columns = useMemo<Column[]>(
    () => (rows.length > 0 ? deriveColumns(rows[0]) : []),
    [rows],
  );

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

  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

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

  const toggleSelection = (key: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    setSelectedKeys((prev) => {
      const multi = event.metaKey || event.ctrlKey;
      const has = prev.includes(key);
      if (multi) return has ? prev.filter((k) => k !== key) : [...prev, key];
      return has ? [] : [key];
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (loading) return <div style={{ padding: '1rem', opacity: 0.6 }}>Loading…</div>;
  if (error) return <div style={{ padding: '1rem', color: 'red' }}>Error: {error}</div>;

  return (
    <div className="tree-table-wrap">
      <table className="tree-table">
        <colgroup>
          {visibleLeafColumns.map((col) => (
            <col key={col.id} style={{ width: `${columnWidths[col.id] ?? 120}px`, minWidth: '8px' }} />
          ))}
        </colgroup>
        <thead>
          {headerRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map(({ column, colSpan, rowSpan, depth }: HeaderCell, cellIndex: number) => {
                const headerKey = `header:${column.id}:${depth}`;
                const isHeaderSelected = selectedSet.has(headerKey);
                const resizerTargetId = resizerTargetByColumn.get(column.id);
                const isLeaf = !column.subColumns || column.subColumns.length === 0;
                const leafIdsToHide = isLeaf
                  ? (hiddenSet.has(column.id) ? [] : [column.id])
                  : getVisibleLeafColumns(column, hiddenSet).map((c) => c.id);
                const showMenu = leafIdsToHide.length > 0;
                const isSticky = cellIndex === 0;

                return (
                  <th
                    key={headerKey}
                    colSpan={colSpan}
                    rowSpan={rowSpan}
                    className={[isHeaderSelected ? 'header-selected' : '', isSticky ? 'sticky-col' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={(e) => toggleSelection(headerKey, e)}
                  >
                    <div className="column-group">
                      {column.label}
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
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHiddenColumns((prev) => [...prev, ...leafIdsToHide.filter((id) => !prev.includes(id))]);
                                      setOpenMenuColumn(null);
                                      setMenuAnchor(null);
                                    }}
                                  >
                                    {isLeaf ? 'Hide column' : 'Hide group'}
                                  </button>
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
              {visibleLeafColumns.map((col: Column, colIndex: number) => {
                const bodyKey = `cell:${rowIndex}:${col.id}`;
                return (
                  <td
                    key={bodyKey}
                    className={[selectedSet.has(bodyKey) ? 'cell-selected' : '', colIndex === 0 ? 'sticky-col' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={(e) => toggleSelection(bodyKey, e)}
                  >
                    {formatCell(row[col.id], col.id)}
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
    </div>
  );
}
