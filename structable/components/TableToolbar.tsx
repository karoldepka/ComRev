'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ApiTable } from '../types/table';

type Props = {
  tableId: string;
  tables: ApiTable[];
  onAddTable: () => void;
  onSelectTable: (id: string) => void;
  onShowAllTables: () => void;
  onRenameTable: (id: string, title: string) => void;
};

export default function TableToolbar({
  tableId, tables, onAddTable, onSelectTable, onShowAllTables, onRenameTable,
}: Props) {
  const current     = tables.find((t) => t.id === tableId);
  const displayTitle = current?.title || tableId;

  const [menuOpen, setMenuOpen]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [titleDraft, setTitleDraft] = useState(displayTitle);

  useEffect(() => {
    if (!editing) setTitleDraft(displayTitle);
  }, [displayTitle, editing]);

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the dropdown below the button
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({ display: 'none' });
  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) { setDropdownStyle({ display: 'none' }); return; }
    const r = btnRef.current.getBoundingClientRect();
    setDropdownStyle({ position: 'fixed', top: r.bottom + 4, left: r.left });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const saveTitle = () => {
    setEditing(false);
    const t = titleDraft.trim() || tableId;
    if (t !== displayTitle) onRenameTable(tableId, t);
  };

  return (
    <div className="table-toolbar">
      <button
        ref={btnRef}
        type="button"
        className="table-hamburger"
        aria-label="Table menu"
        onClick={() => setMenuOpen((v) => !v)}
      >
        ☰
      </button>

      {menuOpen && (
        <div ref={menuRef} className="table-dropdown" style={dropdownStyle}>
          <button type="button" onClick={() => { setMenuOpen(false); onAddTable(); }}>
            + Add table
          </button>
          {tables.length > 0 && <div className="menu-divider" />}
          {tables.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tableId ? 'menu-active' : ''}
              onClick={() => { setMenuOpen(false); onSelectTable(t.id); }}
            >
              {t.title || t.id}
            </button>
          ))}
          <div className="menu-divider" />
          <button type="button" onClick={() => { setMenuOpen(false); onShowAllTables(); }}>
            Show all tables
          </button>
        </div>
      )}

      {editing ? (
        <input
          autoFocus
          className="table-title-input"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  saveTitle();
            if (e.key === 'Escape') { setEditing(false); setTitleDraft(displayTitle); }
          }}
        />
      ) : (
        <span
          className="table-title"
          title="Click to rename"
          onClick={() => { setTitleDraft(displayTitle); setEditing(true); }}
        >
          {displayTitle}
        </span>
      )}
    </div>
  );
}
