'use client';

import { FLAG_COLORS } from '../types/table';

export type FlagSubmenuProps = {
  flagKeys: string[];
  cellFlags: Record<string, string>;
  onFlagsChange: (toSet: Record<string, string>, toDelete: string[]) => void;
  onClose: () => void;
  onBack: () => void;
};

export default function FlagSubmenu({
  flagKeys,
  cellFlags,
  onFlagsChange,
  onClose,
  onBack,
}: FlagSubmenuProps) {
  const hasAnyFlag = flagKeys.some((k) => cellFlags[k]);

  return (
    <div className="menu-flag-col" onClick={(e) => e.stopPropagation()}>
      {FLAG_COLORS.map(({ id, label, bg }) => {
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
