'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FlagSubmenu from './FlagSubmenu';
import type { ApiRemark, CellTarget, RemarkTarget, RowClass } from '../types/table';
import { colType, colFilterParam, colFilterPlaceholder, type ColType } from '../utils/columnFilters';

type Column = { id: string; label: string; readOnly?: boolean; isFrozen?: boolean; filterType?: ColType | null; subColumns?: Column[] };

// ── Discriminated props ────────────────────────────────────────────────────────

type BaseProps = {
  anchor: { top: number; left: number };
  focusOnOpen?: boolean;
  cellFlags: Record<string, string>;
  cellRemarks: Record<string, ApiRemark[]>;       // key: `${rowId}:${colId}` (rowId='' for headers)
  onFlagsChange: (toSet: Record<string, string>, toDelete: string[]) => void;
  onSaveRemark: (
    targets: RemarkTarget[],
    kind: 'note' | 'comment',
    body: string,
    existingId: string | null,
  ) => void;
  onClose: () => void;
  availableClasses: RowClass[];
};

export type HeaderMenuProps = BaseProps & {
  kind: 'header';
  column: Column;
  mode: 'menu' | 'flag' | 'note' | 'comment';
  isLeaf: boolean;
  allColsToHide: string[];
  sort: { col: string; dir: 'asc' | 'desc' };
  filters: Record<string, string>;
  filterDraft: Record<string, string>;
  setFilterDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  draftText: string;
  setDraftText: (v: string) => void;
  onSetMode:    (m: 'menu' | 'flag' | 'note' | 'comment') => void;
  onSort:       (col: string, dir: 'asc' | 'desc') => void;
  onApplyFilter:(colId: string) => void;
  onClearFilter:(colId: string) => void;
  onHide:             (ids: string[]) => void;
  onMoveToLeftEdge?:  (colIds: string[]) => void;
  onAddColClick:(colId: string) => void;
  onToggleFrozen?: (colId: string, next: boolean) => void;
  onDeleteCol:    (colId: string) => void;
  onUngroup?:     (groupId: string) => void;
  onProperties?:  (colId: string) => void;
};

export type CellMenuProps = BaseProps & {
  kind: 'cell';
  targets: CellTarget[];
  mode: 'menu' | 'note' | 'comment' | 'flag';
  draftText: string;
  setDraftText: (v: string) => void;
  onSetMode:    (m: 'menu' | 'note' | 'comment' | 'flag') => void;
  onHideCols:   (colIds: string[]) => void;
  onHideRows:   (rowIds: string[]) => void;
};

export type ContextMenuProps = HeaderMenuProps | CellMenuProps;

// ── Unified component ──────────────────────────────────────────────────────────

export default function ContextMenu(props: ContextMenuProps) {
  const { anchor, cellFlags, cellRemarks, onFlagsChange, onSaveRemark, onClose, availableClasses } = props;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    position: 'absolute',
    top: anchor.top,
    left: anchor.left,
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let vLeft = props.kind === 'header'
      ? anchor.left - window.scrollX - width
      : anchor.left - window.scrollX;
    let vTop = anchor.top - window.scrollY;
    if (vLeft < pad)               vLeft = pad;
    if (vLeft + width  > vw - pad) vLeft = vw - width - pad;
    if (vTop  < pad)               vTop  = pad;
    if (vTop  + height > vh - pad) vTop  = vh - height - pad;
    setMenuStyle({
      position: 'absolute',
      top:  vTop  + window.scrollY,
      left: vLeft + window.scrollX,
      visibility: 'visible',
    });
  }, [anchor.top, anchor.left, props.kind]);

  useEffect(() => {
    if (!props.focusOnOpen || props.mode !== 'menu') return;
    const timer = window.setTimeout(() => {
      const firstButton = menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      firstButton?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [anchor.top, anchor.left, props.focusOnOpen, props.mode]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    if (
      e.target instanceof HTMLElement
      && e.target.closest('input, textarea, select, [contenteditable], [role="textbox"]')
    ) {
      return;
    }
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (buttons.length === 0) return;

    e.preventDefault();
    e.stopPropagation();
    const currentIndex = buttons.findIndex((button) => button === document.activeElement);
    let nextIndex = 0;
    if (e.key === 'End') {
      nextIndex = buttons.length - 1;
    } else if (e.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
    } else if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 || currentIndex >= buttons.length - 1 ? 0 : currentIndex + 1;
    }
    buttons[nextIndex]?.focus();
  };

  if (typeof document === 'undefined') return null;

  let content: React.ReactNode;

  // ── Header content ─────────────────────────────────────────────────────────

  if (props.kind === 'header') {
    const {
      column, mode, isLeaf, allColsToHide,
      sort, filters, filterDraft, setFilterDraft,
      draftText, setDraftText,
      onSetMode, onSort, onApplyFilter, onClearFilter,
      onHide, onMoveToLeftEdge, onAddColClick, onToggleFrozen, onDeleteCol, onUngroup, onProperties,
    } = props;

    const flagKey    = `header:${column.id}`;
    const remarkKey  = `0:${column.id}`;
    const targets: RemarkTarget[] = [{ row_id: '', column_id: column.id }];
    const existingNote    = cellRemarks[remarkKey]?.find((r) => r.kind === 'note');
    const existingComment = cellRemarks[remarkKey]?.find((r) => r.kind === 'comment');
    const colHasFilter = () => { const p = colFilterParam(column); return !!p && !!filters[p]; };

    content = mode === 'flag' ? (
      <FlagSubmenu
        flagKeys={[flagKey]}
        cellFlags={cellFlags}
        onFlagsChange={onFlagsChange}
        onClose={onClose}
        onBack={() => onSetMode('menu')}
        availableClasses={availableClasses}
      />
    ) : (mode === 'note' || mode === 'comment') ? (
      <div className="menu-add-col" onClick={(e) => e.stopPropagation()}>
        <textarea
          autoFocus
          rows={3}
          placeholder={mode === 'note' ? 'Note…' : 'Comment…'}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
        />
        <div className="menu-add-col-actions">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const existing = mode === 'note' ? existingNote : existingComment;
              onSaveRemark(targets, mode, draftText, existing?.id ?? null);
              onClose();
            }}
          >
            Save
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSetMode('menu'); }}>
            Back
          </button>
        </div>
      </div>
    ) : (
      <>
        {isLeaf && (
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
            {isLeaf && colFilterParam(column) && (
              <>
                <div className="menu-divider" />
                <div className="menu-section-label">Filter</div>
                <div className="menu-filter">
                  <input
                    type={colType(column) === 'numeric' ? 'number' : 'text'}
                    placeholder={colFilterPlaceholder(column)}
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
        <>
          {!column.readOnly && isLeaf && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteCol(column.id); }}
            >
              Delete column
            </button>
          )}
          {!isLeaf && onUngroup && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUngroup(column.id); }}
            >
              Ungroup
            </button>
          )}
          {onProperties && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onProperties(column.id); onClose(); }}
            >
              Column properties…
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddColClick(column.id); }}
          >
            + New column
          </button>
          {isLeaf && onToggleFrozen && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFrozen(column.id, !column.isFrozen); onClose(); }}
            >
              {column.isFrozen ? 'Unfreeze column' : 'Freeze column'}
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
              {onMoveToLeftEdge && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMoveToLeftEdge(allColsToHide); onClose(); }}
                >
                  {allColsToHide.length > 1
                    ? `Move ${allColsToHide.length} columns to left edge`
                    : 'Move column to left edge'}
                </button>
              )}
            </>
          )}
        </>
        <div className="menu-divider" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetMode('note');
            setDraftText(existingNote?.body ?? '');
          }}
        >
          {existingNote ? 'Edit note' : 'Add note'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetMode('comment');
            setDraftText(existingComment?.body ?? '');
          }}
        >
          {existingComment ? 'Edit comment' : 'Add comment'}
        </button>
        <div className="menu-divider" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSetMode('flag'); }}
        >
          {cellFlags[flagKey] ? `Flag: ${cellFlags[flagKey]} →` : 'Flag →'}
        </button>
      </>
    );

  // ── Cell content ───────────────────────────────────────────────────────────

  } else {
    const {
      targets, mode, draftText,
      setDraftText, onSetMode,
      onHideCols, onHideRows,
    } = props;

    const n = targets.length;
    const isSingle = n === 1;
    const firstKey = `${targets[0].rowId}:${targets[0].colId}`;
    const colsToHide = [...new Set(targets.map((t) => t.colId))];
    const rowsToHide = [...new Set(targets.map((t) => t.rowId))].filter((id) => id !== '');
    const remarkTargets: RemarkTarget[] = targets.map((t) => ({ row_id: t.rowId, column_id: t.colId }));

    const existingNote    = isSingle ? cellRemarks[firstKey]?.find((r) => r.kind === 'note')    : undefined;
    const existingComment = isSingle ? cellRemarks[firstKey]?.find((r) => r.kind === 'comment') : undefined;

    content = (
      <>
        {mode === 'menu' && (
          <>
            {isSingle
              ? <div className="menu-section-label" style={{ paddingTop: 6 }}>{targets[0].colId}</div>
              : <div className="menu-section-label" style={{ paddingTop: 6 }}>{n} cells selected</div>
            }
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetMode('note');
                setDraftText(existingNote?.body ?? '');
              }}
            >
              {isSingle
                ? (existingNote ? 'Edit note' : 'Add note')
                : `Add note to ${n} cells`}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetMode('comment');
                setDraftText(existingComment?.body ?? '');
              }}
            >
              {isSingle
                ? (existingComment ? 'Edit comment' : 'Add comment')
                : `Comment ${n} cells`}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSetMode('flag'); }}
            >
              {isSingle
                ? (cellFlags[firstKey] ? `Flag: ${cellFlags[firstKey]}` : 'Flag cell')
                : `Flag ${n} cells`}
            </button>
            {colsToHide.length > 0 && (
              <>
                <div className="menu-divider" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onHideCols(colsToHide); onClose(); }}
                >
                  {colsToHide.length === 1 ? 'Hide column' : `Hide ${colsToHide.length} columns`}
                </button>
              </>
            )}
            {rowsToHide.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onHideRows(rowsToHide); onClose(); }}
              >
                {rowsToHide.length === 1 ? 'Hide row' : `Hide ${rowsToHide.length} rows`}
              </button>
            )}
          </>
        )}
        {mode === 'flag' && (
          <FlagSubmenu
            flagKeys={targets.map(({ rowId, colId }) => `${rowId}:${colId}`)}
            cellFlags={cellFlags}
            onFlagsChange={onFlagsChange}
            onClose={onClose}
            onBack={() => onSetMode('menu')}
            availableClasses={availableClasses}
          />
        )}
        {(mode === 'note' || mode === 'comment') && (
          <div className="menu-add-col" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              rows={3}
              placeholder={mode === 'note' ? 'Note…' : 'Comment…'}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
            <div className="menu-add-col-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const existing = mode === 'note' ? existingNote : existingComment;
                  onSaveRemark(remarkTargets, mode, draftText, existing?.id ?? null);
                  onClose();
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetMode('menu'); }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={menuStyle}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleMenuKeyDown}
    >
      {content}
    </div>,
    document.body,
  );
}
