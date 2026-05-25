'use client';

import { createPortal } from 'react-dom';
import FlagSubmenu from './FlagSubmenu';
import type { CellTarget } from '../types/table';

const PINNED_COL = 'name';

export type CellMenuProps = {
  anchor: { top: number; left: number };
  targets: CellTarget[];
  mode: 'menu' | 'note' | 'comment' | 'flag';
  draftText: string;
  cellFlags:    Record<string, string>;
  onFlagsChange: (toSet: Record<string, string>, toDelete: string[]) => void;
  cellNotes:    Record<string, string>;
  cellComments: Record<string, { id: number; body: string }>;
  setDraftText: (v: string) => void;
  onSetMode:    (m: 'menu' | 'note' | 'comment' | 'flag') => void;
  onSaveNote:   (keys: string[], text: string) => void;
  onSaveComment:(targets: CellTarget[], text: string) => Promise<void>;
  onHideCols:   (colIds: string[]) => void;
  onHideRows:   (repoIds: number[]) => void;
  onClose:      () => void;
};

export default function CellMenu({
  anchor, targets, mode, draftText,
  cellFlags, onFlagsChange, cellNotes, cellComments,
  setDraftText, onSetMode, onSaveNote, onSaveComment,
  onHideCols, onHideRows, onClose,
}: CellMenuProps) {
  const n = targets.length;
  const isSingle = n === 1;
  const firstKey = `${targets[0].repoId}:${targets[0].colId}`;
  const allKeys = targets.map(({ repoId, colId }) => `${repoId}:${colId}`);

  const colsToHide = [...new Set(targets.map((t) => t.colId))].filter(
    (id) => id !== PINNED_COL,
  );
  const rowsToHide = [...new Set(targets.map((t) => t.repoId))].filter((id) => id > 0);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="column-menu cell-context-menu"
      style={{ position: 'absolute', top: anchor.top, left: anchor.left }}
    >
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
    </div>,
    document.body,
  );
}
