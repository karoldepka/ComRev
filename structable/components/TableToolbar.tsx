'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ApiTable } from '../types/table';
import NukeDbDialog from './NukeDbDialog';

type Props = {
  tableId?: string;
  title?: string;
  tables?: ApiTable[];
  onAddTable?: () => void;
  onAddColumn?: () => void;
  onShowAllTables?: () => void;
  onRenameTable?: (id: string, title: string) => void;
  onNukeDb?: () => Promise<void>;
};

const TABLE_IMPLS = [
  { href: '/',         label: 'Custom TreeTable' },
  { href: '/tanstack', label: 'TanStack Table' },
];

export default function TableToolbar({
  tableId, title, tables = [], onAddTable, onAddColumn, onShowAllTables, onRenameTable, onNukeDb,
}: Props) {
  const path = usePathname();
  const current = tableId ? tables.find((t) => t.id === tableId) : undefined;
  const displayTitle = title ?? current?.title ?? tableId ?? 'Table';
  const canRename = !!tableId && !!onRenameTable;
  const hasTableActions = !!(onAddTable || onAddColumn || onShowAllTables || tables.length > 0);

  const [menuOpen, setMenuOpen]     = useState(false);
  const [nukeOpen, setNukeOpen]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [titleDraft, setTitleDraft] = useState(displayTitle);

  useEffect(() => {
    if (!editing) setTitleDraft(displayTitle);
  }, [displayTitle, editing]);

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (!tableId || !onRenameTable) return;
    const nextTitle = titleDraft.trim() || tableId;
    if (nextTitle !== displayTitle) onRenameTable(tableId, nextTitle);
  };

  return (
    <>
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
          <div className="table-dropdown-section-label">Table renderer</div>
          {TABLE_IMPLS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={['table-dropdown-link', path === href ? 'menu-active' : ''].filter(Boolean).join(' ')}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}

          {hasTableActions && (
            <>
              <div className="menu-divider" />
              {onAddTable && (
                <button type="button" onClick={() => { setMenuOpen(false); onAddTable(); }}>
                  + Add table
                </button>
              )}
              {onAddColumn && (
                <button type="button" onClick={() => { setMenuOpen(false); onAddColumn(); }}>
                  + Add column
                </button>
              )}
              {tables.length > 0 && <div className="menu-divider" />}
              {tables.map((t) => (
                <Link
                  key={t.id}
                  href={`/t/${t.id}`}
                  className={['table-dropdown-link', t.id === tableId ? 'menu-active' : ''].filter(Boolean).join(' ')}
                  onClick={() => setMenuOpen(false)}
                >
                  {t.title || t.id}
                </Link>
              ))}
              {onShowAllTables && (
                <>
                  <div className="menu-divider" />
                  <button type="button" onClick={() => { setMenuOpen(false); onShowAllTables(); }}>
                    Show all tables
                  </button>
                </>
              )}
              {onNukeDb && (
                <>
                  <div className="menu-divider" />
                  <button
                    type="button"
                    className="menu-danger"
                    onClick={() => { setMenuOpen(false); setNukeOpen(true); }}
                  >
                    NUKE__DB
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {editing && canRename ? (
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
          title={canRename ? 'Click to rename' : undefined}
          onClick={() => {
            if (!canRename) return;
            setTitleDraft(displayTitle);
            setEditing(true);
          }}
        >
          {displayTitle}
        </span>
      )}
    </div>
    {nukeOpen && onNukeDb && (
      <NukeDbDialog
        onConfirm={() => { setNukeOpen(false); onNukeDb(); }}
        onCancel={() => setNukeOpen(false)}
      />
    )}
  </>
  );
}
