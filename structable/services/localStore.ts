const KEYS = {
  columnWidths:     'structable:column-widths',
  columnOrder:      'structable:column-order',
  legacyCellFlags:  'structable:cell-flags',
  legacyHiddenCols: 'structable:hidden-columns',
  legacyCellNotes:  'structable:cell-notes',   // read-once for V3 migration
  migratedV2:       'structable:migrated-v2',
  migratedV3:       'structable:migrated-v3',  // notes migrated to server remarks
} as const;

function parse<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
}

export const localStore = {
  getColumnWidths: (): Record<string, number>  => parse(KEYS.columnWidths, {}),
  setColumnWidths: (v: Record<string, number>) => store(KEYS.columnWidths, v),

  getColumnOrder: (): string[]  => parse(KEYS.columnOrder, []),
  setColumnOrder: (v: string[]) => store(KEYS.columnOrder, v),

  // One-time migration helpers — read legacy data then stop using these
  getLegacyCellFlags:  (): Record<string, string> => parse(KEYS.legacyCellFlags, {}),
  getLegacyHiddenCols: (): string[]               => parse(KEYS.legacyHiddenCols, []),
  getLegacyCellNotes:  (): Record<string, string> => parse(KEYS.legacyCellNotes, {}),

  isMigratedV2: (): boolean => typeof window !== 'undefined' && !!localStorage.getItem(KEYS.migratedV2),
  setMigratedV2: (): void   => { if (typeof window !== 'undefined') localStorage.setItem(KEYS.migratedV2, '1'); },

  isMigratedV3: (): boolean => typeof window !== 'undefined' && !!localStorage.getItem(KEYS.migratedV3),
  setMigratedV3: (): void   => { if (typeof window !== 'undefined') localStorage.setItem(KEYS.migratedV3, '1'); },
};
