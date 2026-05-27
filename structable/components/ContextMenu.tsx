'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FlagSubmenu from './FlagSubmenu';
import type { CellTarget } from '../types/table';
import { colType, colFilterParam, colFilterPlaceholder } from '../utils/columnFilters';

type Column = { id: string; label: string; subColumns?: Column[] };

// ── Discriminated props ────────────────────────────────────────────────────────

type BaseProps = {
  anchor: { top: number; left: number };
  cellFlags: Record<string, string>;
  onFlagsChange: (toSet: Record<string, string>, toDelete: string[]) => void;
  onClose: () => void;
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
  addingColAfter: string | null;
  newColName: string;
  newColId: string;
  newColExpr: string;
  setNewColName: (v: string) => void;
  setNewColId:   (v: string) => void;
  setNewColExpr: (v: string) => void;
  draftText: string;
  setDraftText: (v: string) => void;
  headerNoteText: string | undefined;
  headerCommentBody: string | undefined;
  onSetMode:    (m: 'menu' | 'flag' | 'note' | 'comment') => void;
  onSort:       (col: string, dir: 'asc' | 'desc') => void;
  onApplyFilter:(colId: string) => void;
  onClearFilter:(colId: string) => void;
  onHide:       (ids: string[]) => void;
  onAddColClick:(colId: string) => void;
  onCreateCol:  (afterColId: string) => void;
  onDeleteCol:  (colId: string) => void;
  onSaveNote:   (keys: string[], text: string) => void;
  onSaveComment:(colId: string, text: string) => Promise<void>;
};

export type CellMenuProps = BaseProps & {
  kind: 'cell';
  targets: CellTarget[];
  mode: 'menu' | 'note' | 'comment' | 'flag';
  draftText: string;
  cellNotes: Record<string, string>;
  cellComments: Record<string, { id: number; body: string }>;
  setDraftText: (v: string) => void;
  onSetMode:    (m: 'menu' | 'note' | 'comment' | 'flag') => void;
  onSaveNote:   (keys: string[], text: string) => void;
  onSaveComment:(targets: CellTarget[], text: string) => Promise<void>;
  onHideCols:   (colIds: string[]) => void;
  onHideRows:   (repoIds: number[]) => void;
};

export type ContextMenuProps = HeaderMenuProps | CellMenuProps;

const PINNED_COL = 'name';

// ── Unified component ──────────────────────────────────────────────────────────

export default function ContextMenu(props: ContextMenuProps) {
  const { anchor, cellFlags, onFlagsChange, onClose } = props;

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
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // header: right edge sits at anchor.left; cell: left edge at anchor.left
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

  if (typeof document === 'undefined') return null;

  // ── Header content ─────────────────────────────────────────────────────────

  let content: React.ReactNode;

  if (props.kind === 'header') {
    const {
      column, mode, isLeaf, allColsToHide,
      sort, filters, filterDraft, setFilterDraft,
      addingColAfter, newColName, newColId, newColExpr,
      setNewColName, setNewColId, setNewColExpr,
      draftText, setDraftText, headerNoteText, headerCommentBody,
      onSetMode, onSort, onApplyFilter, onClearFilter,
      onHide, onAddColClick, onCreateCol, onDeleteCol,
      onSaveNote, onSaveComment,
    } = props;

    const flagKey = `header:${column.id}`;
    const colHasFilter = () => { const p = colFilterParam(column.id); return !!p && !!filters[p]; };

    content = mode === 'flag' ? (
      <FlagSubmenu
        flagKeys={[flagKey]}
        cellFlags={cellFlags}
        onFlagsChange={onFlagsChange}
        onClose={onClose}
        onBack={() => onSetMode('menu')}
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
              if (mode === 'note') {
                onSaveNote([flagKey], draftText);
                onClose();
              } else {
                onSaveComment(column.id, draftText).then(onClose);
              }
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
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteCol(column.id); }}
            >
              Delete column
            </button>
            {allColsToHide.length > 0 && (
              <>
                <div className="menu-divider" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onHide(allColsToHide); }}
                >
                  Hide column
                </button>
              </>
            )}
          </>
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
          onClick={(e) => { e.stopPropagation(); onSetMode('note'); setDraftText(headerNoteText ?? ''); }}
        >
          {headerNoteText ? 'Edit note' : 'Add note'}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSetMode('comment'); setDraftText(headerCommentBody ?? ''); }}
        >
          {headerCommentBody ? 'Edit comment' : 'Add comment'}
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
      targets, mode, draftText, cellNotes, cellComments,
      setDraftText, onSetMode, onSaveNote, onSaveComment,
      onHideCols, onHideRows,
    } = props;

    const n = targets.length;
    const isSingle = n === 1;
    const firstKey = `${targets[0].repoId}:${targets[0].colId}`;
    const allKeys = targets.map(({ repoId, colId }) => `${repoId}:${colId}`);
    const colsToHide = [...new Set(targets.map((t) => t.colId))].filter((id) => id !== PINNED_COL);
    const rowsToHide = [...new Set(targets.map((t) => t.repoId))].filter((id) => id > 0);

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
                setDraftText(isSingle ? (cellNotes[firstKey] ?? '') : '');
              }}
            >
              {isSingle
                ? (cellNotes[firstKey] ? 'Edit note' : 'Add note')
                : `Add note to ${n} cells`}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetMode('comment');
                setDraftText(isSingle ? (cellComments[firstKey]?.body ?? '') : '');
              }}
            >
              {isSingle
                ? (cellComments[firstKey] ? 'Edit comment' : 'Add comment')
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
            flagKeys={allKeys}
            cellFlags={cellFlags}
            onFlagsChange={onFlagsChange}
            onClose={onClose}
            onBack={() => onSetMode('menu')}
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
                  if (mode === 'note') {
                    onSaveNote(allKeys, draftText);
                    onClose();
                  } else {
                    onSaveComment(targets, draftText).then(onClose);
                  }
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

  const cssClass = 'context-menu';

  return createPortal(
    <div ref={menuRef} className={cssClass} style={menuStyle}>
      {content}
    </div>,
    document.body,
  );
}
