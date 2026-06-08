'use client';

import type { RowClass } from '../types/table';

export type FlagSubmenuProps = {
  flagKeys: string[];
  cellFlags: Record<string, string>;
  onFlagsChange: (toSet: Record<string, string>, toDelete: string[]) => void;
  onClose: () => void;
  onBack: () => void;
  availableClasses: RowClass[];
};

export default function FlagSubmenu({
  flagKeys,
  cellFlags,
  onFlagsChange,
  onClose,
  onBack,
  availableClasses,
}: FlagSubmenuProps) {
  const hasAnyFlag = flagKeys.some((k) => cellFlags[k]);

  const items = availableClasses.map((cls) => ({
    id: cls.id,
    label: cls.name,
    bg: cls.color ?? '#6366f1',
  }));

  return (
    <div className="menu-flag-col" onClick={(e) => e.stopPropagation()}>
      {items.map(({ id, label, bg }) => {
        const active = flagKeys.every((k) => cellFlags[k] === id);
        return (
          <button
            key={id}
            type="button"
            className={`flag-swatch-row${active ? ' flag-swatch-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              const toSet: Record<string, string> = {};
              const toDelete: string[] = [];
              flagKeys.forEach((k) => { if (active) toDelete.push(k); else toSet[k] = id; });
              onFlagsChange(toSet, toDelete);
              onClose();
            }}
          >
            <span className="flag-swatch-dot" style={{ background: bg }} />
            <span>{label}</span>
            <span className="flag-color-name">{id}</span>
          </button>
        );
      })}
      {items.length === 0 && (
        <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '0.8rem' }}>
          No classes defined yet.
        </div>
      )}
      {hasAnyFlag && (
        <button
          type="button"
          className="flag-clear"
          onClick={(e) => {
            e.stopPropagation();
            onFlagsChange({}, [...flagKeys]);
            onClose();
          }}
        >
          Clear flag
        </button>
      )}
      <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }}>
        Back
      </button>
    </div>
  );
}
