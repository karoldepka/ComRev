'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FlagSubmenu from './FlagSubmenu';

type Column = {
  id: string;
  label: string;
  subColumns?: Column[];
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

export type ColumnMenuProps = {
  column: Column;
  anchor: { top: number; left: number };
  mode: 'menu' | 'flag';
  isLeaf: boolean;
  allColsToHide: string[];
  sort: { col: string; dir: 'asc' | 'desc' };
  filters: Record<string, string>;
  filterDraft: Record<string, string>;
  cellFlags: Record<string, string>;
  onFlagsChange: (toSet: Record<string, string>, toDelete: string[]) => void;
  addingColAfter: string | null;
  newColName: string;
  newColId: string;
  newColExpr: string;
  setFilterDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setNewColName: (v: string) => void;
  setNewColId:   (v: string) => void;
  setNewColExpr: (v: string) => void;
  onSetMode:    (m: 'menu' | 'flag') => void;
  onSort:       (col: string, dir: 'asc' | 'desc') => void;
  onApplyFilter:(colId: string) => void;
  onClearFilter:(colId: string) => void;
  onHide:       (ids: string[]) => void;
  onAddColClick:(colId: string) => void;
  onCreateCol:  (afterColId: string) => void;
  onDeleteCol:  (colId: string) => void;
  onClose:      () => void;
};

export default function ColumnMenu({
  column, anchor, mode, isLeaf, allColsToHide,
  sort, filters, filterDraft, cellFlags, onFlagsChange,
  addingColAfter, newColName, newColId, newColExpr,
  setFilterDraft, setNewColName, setNewColId, setNewColExpr,
  onSetMode, onSort, onApplyFilter, onClearFilter,
  onHide, onAddColClick, onCreateCol, onDeleteCol, onClose,
}: ColumnMenuProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    position: 'absolute',
    top: anchor.top,
    left: anchor.left,
    transform: 'translateX(-100%)',
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Default: menu's right edge sits at anchor.left (translateX(-100%))
    let vLeft = anchor.left - window.scrollX - width;
    let vTop  = anchor.top  - window.scrollY;
    if (vLeft < pad)             vLeft = pad;
    if (vLeft + width  > vw - pad) vLeft = vw - width - pad;
    if (vTop  < pad)             vTop  = pad;
    if (vTop  + height > vh - pad) vTop  = vh - height - pad;
    setMenuStyle({
      position: 'absolute',
      top: vTop  + window.scrollY,
      left: vLeft + window.scrollX,
      visibility: 'visible',
    });
  }, [anchor.top, anchor.left]);

  const flagKey = `header:${column.id}`;
  const colHasFilter = () => {
    const p = colFilterParam(column.id);
    return !!p && !!filters[p];
  };

  const menuContent =
    mode === 'flag' ? (
      <FlagSubmenu
        flagKeys={[flagKey]}
        cellFlags={cellFlags}
        onFlagsChange={onFlagsChange}
        onClose={onClose}
        onBack={() => onSetMode('menu')}
      />
    ) : (
      <>
        {!column.id.startsWith('custom:') && (
          <>
            <div className="menu-section-label">Sort</div>
            <button
              type="button"
              className={sort.col === column.id && sort.dir === 'asc' ? 'menu-active' : ''}
              onClick={(e) => { e.stopPropagation(); onSort(column.id, 'asc'); }}
            >
              ↑ Ascending
            </button>
            <button
              type="button"
              className={sort.col === column.id && sort.dir === 'desc' ? 'menu-active' : ''}
              onClick={(e) => { e.stopPropagation(); onSort(column.id, 'desc'); }}
            >
              ↓ Descending
            </button>
            {isLeaf && colFilterParam(column.id) && (
              <>
                <div className="menu-divider" />
                <div className="menu-section-label">Filter</div>
                <div className="menu-filter">
                  <input
                    type={colType(column.id) === 'numeric' ? 'number' : 'text'}
                    placeholder={colFilterPlaceholder(column.id)}
                    value={filterDraft[column.id] ?? ''}
                    onChange={(e) =>
                      setFilterDraft((prev) => ({ ...prev, [column.id]: e.target.value }))
                    }
                    onKeyDown={(e) => { if (e.key === 'Enter') onApplyFilter(column.id); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onApplyFilter(column.id); }}
                  >
                    Apply
                  </button>
                </div>
                {colHasFilter() && (
                  <button
                    type="button"
                    className="menu-clear-filter"
                    onClick={(e) => { e.stopPropagation(); onClearFilter(column.id); }}
                  >
                    ✕ Clear filter
                  </button>
                )}
              </>
            )}
          </>
        )}
        <div className="menu-divider" />
        {column.id.startsWith('custom:') ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeleteCol(column.id); }}
          >
            Delete column
          </button>
        ) : (
          <>
            {addingColAfter === column.id ? (
              <div className="menu-add-col" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  placeholder="Column label…"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCreateCol(column.id);
                    if (e.key === 'Escape') onAddColClick('');
                  }}
                />
                <input
                  placeholder={`ID (default: ${newColName.trim().toLowerCase().replace(/\s+/g, '_') || 'auto'})`}
                  value={newColId}
                  onChange={(e) => setNewColId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCreateCol(column.id);
                    if (e.key === 'Escape') onAddColClick('');
                  }}
                />
                <input
                  placeholder="JS expression (optional, e.g. row.stars/row.forks)…"
                  value={newColExpr}
                  onChange={(e) => setNewColExpr(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onCreateCol(column.id); }}
                />
                <div className="menu-add-col-actions">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCreateCol(column.id); }}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddColClick('');
                      setNewColName('');
                      setNewColId('');
                      setNewColExpr('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddColClick(column.id); }}
              >
                + Add column to the right
              </button>
            )}
            {allColsToHide.length > 0 && (
              <>
                <div className="menu-divider" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onHide(allColsToHide); }}
                >
                  {allColsToHide.length > 1
                    ? `Hide ${allColsToHide.length} columns`
                    : isLeaf ? 'Hide column' : 'Hide group'}
                </button>
              </>
            )}
          </>
        )}
        <div className="menu-divider" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSetMode('flag'); }}
        >
          {cellFlags[flagKey] ? `Flag: ${cellFlags[flagKey]} →` : 'Flag →'}
        </button>
      </>
    );

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={menuRef} className="column-menu" style={menuStyle}>
      {menuContent}
    </div>,
    document.body,
  );
}
