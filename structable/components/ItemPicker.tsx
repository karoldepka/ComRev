'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type PickerItem = {
  id: string;
  label: string;
  color?: string | null;
  depth?: number;
  parentId?: string | null;
};

type Props = {
  /** All available items to pick from. */
  items: PickerItem[];
  /** IDs of currently selected items. */
  selectedIds: string[];
  /** Called when user clicks Apply. newItems contains items created within this session. */
  onConfirm: (selectedIds: string[], newItems: PickerItem[]) => void;
  onClose: () => void;
  anchor: { top: number; left: number };
  /** Label shown in the header. */
  title?: string;
  /** If provided, show "Add new" UI with this label and color picker. */
  allowCreate?: boolean;
  /** Create a locally usable item before it is persisted. */
  createItem?: (label: string, color?: string) => PickerItem;
  colorChoices?: string[];
};

const DEFAULT_COLORS = [
  '#6366f1', '#f97316', '#16a34a', '#dc2626',
  '#2563eb', '#9333ea', '#d97706', '#0891b2',
];

export default function ItemPicker({
  items,
  selectedIds,
  onConfirm,
  onClose,
  anchor,
  title = 'Pick items',
  allowCreate = false,
  createItem,
  colorChoices = DEFAULT_COLORS,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(colorChoices[0] ?? '#6366f1');
  const [localItems, setLocalItems] = useState<PickerItem[]>(items);
  const [pendingNew, setPendingNew] = useState<PickerItem[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, PickerItem[]>();
    for (const item of localItems) {
      const parent = item.parentId ?? null;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(item);
    }
    return map;
  }, [localItems]);

  const hasChildrenSet = useMemo(() => {
    const set = new Set<string>();
    for (const item of localItems) {
      if (item.parentId != null) set.add(item.parentId);
    }
    return set;
  }, [localItems]);

  const needle = search.toLowerCase();

  // When searching show all label-matching items flat; otherwise traverse the tree respecting collapse.
  const visibleItems = useMemo<PickerItem[]>(() => {
    if (needle) {
      return localItems.filter((item) => item.label.toLowerCase().includes(needle));
    }
    const result: PickerItem[] = [];
    const visit = (parentId: string | null) => {
      for (const item of (childrenByParent.get(parentId) ?? [])) {
        result.push(item);
        if (!collapsedIds.has(item.id)) visit(item.id);
      }
    };
    visit(null);
    return result;
  }, [needle, localItems, childrenByParent, collapsedIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function addNew() {
    const trimmed = newLabel.trim();
    if (!trimmed || !createItem) return;
    const item = createItem(trimmed, colorChoices.length > 0 ? newColor : undefined);
    setLocalItems((prev) => [...prev, item]);
    setPendingNew((prev) => [...prev, item]);
    setSelected((prev) => new Set([...prev, item.id]));
    setNewLabel('');
    setNewColor(colorChoices[0] ?? '#6366f1');
    setSearch('');
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(anchor.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 400),
    left: Math.min(anchor.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 310),
    zIndex: 9999,
  };

  return (
    <div className="item-picker-overlay">
      <div className="item-picker" style={style} ref={panelRef} role="dialog" aria-label={title}>
        <div className="item-picker-header">
          <span>{title}</span>
          <button type="button" className="item-picker-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="item-picker-search-wrap">
          <input
            ref={searchRef}
            type="text"
            className="item-picker-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="item-picker-list">
          {visibleItems.length === 0 && (
            <div className="item-picker-empty">
              {search ? 'No matches.' : 'No items yet. Add one below.'}
            </div>
          )}
          {visibleItems.map((item) => {
            const hasChildren = hasChildrenSet.has(item.id);
            const isExpanded = !collapsedIds.has(item.id);
            const indent = (item.depth ?? 0) * 14;
            return (
              <div
                key={item.id}
                className="item-picker-item"
                style={{ paddingLeft: indent + 2 }}
              >
                <button
                  type="button"
                  className="item-picker-tree-toggle"
                  style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                  onClick={() => toggleCollapse(item.id)}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <input
                  type="checkbox"
                  id={`pick-${item.id}`}
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <label htmlFor={`pick-${item.id}`} className="item-picker-label-wrap">
                  {item.color != null ? (
                    <span className="row-class-chip" style={{ background: item.color }}>
                      {item.label}
                    </span>
                  ) : (
                    <span className="item-picker-label">{item.label}</span>
                  )}
                </label>
              </div>
            );
          })}
        </div>

        {allowCreate && createItem && (
          <div className="item-picker-add">
            <input
              type="text"
              className="item-picker-new-input"
              placeholder={`New ${title.toLowerCase().replace(/^pick\s*/i, '')} name…`}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } }}
            />
            {colorChoices.length > 0 && (
              <div className="item-picker-colors">
                {colorChoices.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`row-class-color-swatch${newColor === color ? ' selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setNewColor(color)}
                    aria-label={color}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              className="item-picker-add-btn"
              onClick={addNew}
              disabled={!newLabel.trim()}
            >
              + Add
            </button>
          </div>
        )}

        <div className="item-picker-footer">
          <button type="button" className="row-class-editor-cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="row-class-editor-confirm"
            onClick={() => onConfirm(Array.from(selected), pendingNew)}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
