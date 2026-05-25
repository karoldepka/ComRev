'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

const columns: Column[] = [
  {
    id: 'personal',
    label: 'Personal',
    subColumns: [
      {
        id: 'identity',
        label: 'Identity',
        subColumns: [
          { id: 'firstName', label: 'First Name', width: 170, minWidth: 120 },
          { id: 'lastName', label: 'Last Name', width: 170, minWidth: 120 },
        ],
      },
      {
        id: 'contact',
        label: 'Contact',
        subColumns: [
          { id: 'email', label: 'Email', width: 260, minWidth: 160 },
          { id: 'phone', label: 'Phone', width: 150, minWidth: 120 },
        ],
      },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    subColumns: [
      {
        id: 'position',
        label: 'Position',
        width: 200,
        minWidth: 140,
      },
      {
        id: 'department',
        label: 'Department',
        width: 180,
        minWidth: 140,
      },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    subColumns: [
      {
        id: 'scoreGroup',
        label: 'Scores',
        subColumns: [
          { id: 'score', label: 'Score', width: 110, minWidth: 90 },
          { id: 'rank', label: 'Rank', width: 100, minWidth: 90 },
        ],
      },
      {
        id: 'trend',
        label: 'Trend',
        width: 120,
        minWidth: 90,
      },
    ],
  },
];

const rows = [
  {
    firstName: 'Avery',
    lastName: 'Taylor',
    email: 'avery.taylor@example.com',
    phone: '+1 (415) 555-0123',
    position: 'Product Lead',
    department: 'Design',
    score: '93',
    rank: '1',
    trend: '↗',
  },
  {
    firstName: 'Jordan',
    lastName: 'Reese',
    email: 'jordan.reese@example.com',
    phone: '+1 (212) 555-0145',
    position: 'Lead Engineer',
    department: 'Platform',
    score: '88',
    rank: '3',
    trend: '→',
  },
  {
    firstName: 'Mina',
    lastName: 'Cho',
    email: 'mina.cho@example.com',
    phone: '+1 (646) 555-0192',
    position: 'Analytics Manager',
    department: 'Data',
    score: '90',
    rank: '2',
    trend: '↗',
  },
  {
    firstName: 'Noah',
    lastName: 'Jackson',
    email: 'noah.jackson@example.com',
    phone: '+1 (323) 555-0176',
    position: 'Sales Director',
    department: 'Revenue',
    score: '81',
    rank: '5',
    trend: '↘',
  },
  {
    firstName: 'Layla',
    lastName: 'Patel',
    email: 'layla.patel@example.com',
    phone: '+1 (503) 555-0114',
    position: 'Finance Analyst',
    department: 'Operations',
    score: '85',
    rank: '4',
    trend: '→',
  },
];

function getLeafColumns(columnList: Column[]): Column[] {
  return columnList.flatMap((column) =>
    column.subColumns ? getLeafColumns(column.subColumns) : [column],
  );
}

function getVisibleLeafColumns(column: Column, hiddenSet: Set<string>): Column[] {
  if (!column.subColumns || column.subColumns.length === 0) {
    return hiddenSet.has(column.id) ? [] : [column];
  }
  return column.subColumns.flatMap((child) => getVisibleLeafColumns(child, hiddenSet));
}

function getColumnDepth(columnList: Column[]): number {
  return columnList.reduce((depth, column) => {
    if (!column.subColumns) {
      return Math.max(depth, 1);
    }
    return Math.max(depth, 1 + getColumnDepth(column.subColumns));
  }, 0);
}

function buildHeaderRows(columnList: Column[], maxDepth: number, hiddenSet: Set<string>) {
  const rows: HeaderCell[][] = Array.from({ length: maxDepth }, () => [] as HeaderCell[]);

  function traverse(column: Column, depth: number): HeaderTraversalResult {
    const isLeaf = !column.subColumns || column.subColumns.length === 0;

    if (isLeaf) {
      if (hiddenSet.has(column.id)) {
        return { colSpan: 0, rowSpan: 0, visible: false };
      }
      const rowSpan = maxDepth - depth + 1;
      rows[depth - 1].push({ column, colSpan: 1, rowSpan, depth });
      return { colSpan: 1, rowSpan, visible: true };
    }

    const childResults = column.subColumns!.map((child) => traverse(child, depth + 1));
    const colSpan = childResults.reduce((sum, result) => sum + (result.visible ? result.colSpan : 0), 0);

    if (colSpan === 0) {
      return { colSpan: 0, rowSpan: 0, visible: false };
    }

    rows[depth - 1].push({ column, colSpan, rowSpan: 1, depth });
    return { colSpan, rowSpan: 1, visible: true };
  }

  columnList.forEach((column) => traverse(column, 1));
  return rows.map((row) => row.filter((cell) => cell.colSpan > 0));
}

export default function TreeTable() {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [openMenuColumn, setOpenMenuColumn] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    getLeafColumns(columns).forEach((column) => {
      widths[column.id] = column.width ?? 130;
    });
    return widths;
  });

  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const lastSelectedRef = useRef<string | null>(null);
  const resizingRef = useRef<{
    id: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const allLeafColumns = useMemo<Column[]>(() => getLeafColumns(columns), []);
  const visibleLeafColumns = useMemo(
    () => allLeafColumns.filter((column) => !hiddenSet.has(column.id)),
    [allLeafColumns, hiddenSet],
  );
  const headerRows = useMemo<HeaderCell[][]>(
    () => buildHeaderRows(columns, getColumnDepth(columns), hiddenSet),
    [hiddenSet],
  );
  const resizerTargetByColumn = useMemo(() => {
    const map = new Map<string, string>();
    function traverse(column: Column) {
      const visibleLeaves = getVisibleLeafColumns(column, hiddenSet);
      if (visibleLeaves.length > 0) {
        map.set(column.id, visibleLeaves[visibleLeaves.length - 1].id);
      }
      column.subColumns?.forEach(traverse);
    }
    columns.forEach(traverse);
    return map;
  }, [hiddenSet]);

  const showColumn = (columnId: string) => {
    setHiddenColumns((prev) => prev.filter((id) => id !== columnId));
  };

  const showAllColumns = () => {
    setHiddenColumns([]);
    setOpenMenuColumn(null);
  };

  const handleResizerPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    columnId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = {
      id: columnId,
      startX: event.clientX,
      startWidth: columnWidths[columnId],
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!resizingRef.current) {
        return;
      }
      const { id, startX, startWidth } = resizingRef.current;
      const delta = moveEvent.clientX - startX;
      setColumnWidths((prev) => {
        const next = Math.max(startWidth + delta, 8);
        return { ...prev, [id]: next };
      });
    };

    const handlePointerUp = () => {
      resizingRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  useEffect(() => {
    if (!openMenuColumn) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.column-menu') && !target.closest('.column-action-button')) {
        setOpenMenuColumn(null);
        setMenuAnchor(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openMenuColumn]);

  const toggleSelection = (key: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    setSelectedKeys((prev) => {
      const isSelected = prev.includes(key);
      const shouldKeepMultiple = event.metaKey || event.ctrlKey;
      const next = shouldKeepMultiple ? [...prev] : [];

      if (shouldKeepMultiple) {
        if (isSelected) {
          return next.filter((item) => item !== key);
        }
        return [...next, key];
      }

      return isSelected ? [] : [key];
    });
    lastSelectedRef.current = key;
  };

  return (
    <div className="tree-table-wrap">
      <table className="tree-table">
        <colgroup>
          {visibleLeafColumns.map((column) => (
            <col
              key={column.id}
              style={{ width: `${columnWidths[column.id]}px`, minWidth: '8px' }}
            />
          ))}
        </colgroup>
        <thead>
          {headerRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map(({ column, colSpan, rowSpan, depth }, cellIndex) => {
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
                    onClick={(event) => toggleSelection(headerKey, event)}
                  >
                    <div className="column-group">
                      {column.label}
                      {showMenu ? (
                        <span className="header-actions">
                          <button
                            type="button"
                            className="column-action-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (openMenuColumn === column.id) {
                                setOpenMenuColumn(null);
                                setMenuAnchor(null);
                              } else {
                                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
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
                                <div
                                  className="column-menu"
                                  style={{ position: 'absolute', top: menuAnchor.top, left: menuAnchor.left, transform: 'translateX(-100%)' }}
                                >
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setHiddenColumns((prev) => [
                                        ...prev,
                                        ...leafIdsToHide.filter((id) => !prev.includes(id)),
                                      ]);
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
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          handleResizerPointerDown(event, resizerTargetId);
                        }}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {visibleLeafColumns.map((column, colIndex) => {
                const bodyKey = `cell:${rowIndex}:${column.id}`;
                const isSelected = selectedSet.has(bodyKey);
                const isSticky = colIndex === 0;
                return (
                  <td
                    key={bodyKey}
                    className={[isSelected ? 'cell-selected' : '', isSticky ? 'sticky-col' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={(event) => toggleSelection(bodyKey, event)}
                  >
                    {row[column.id as keyof typeof row] ?? '-'}
                    <div
                      className="resizer"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        handleResizerPointerDown(event, column.id);
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-note">
        Tip: Ctrl/Cmd + click to select multiple cells, including header groups.
        {hiddenColumns.length > 0 ? (
          <span className="hidden-columns-controls">
            Hidden:{' '}
            {hiddenColumns.map((id) => {
              const col = allLeafColumns.find((c) => c.id === id);
              return (
                <button key={id} type="button" className="show-column-button" onClick={() => showColumn(id)}>
                  {col?.label ?? id}
                </button>
              );
            })}
            <button type="button" className="show-all-button" onClick={showAllColumns}>
              Show all
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
