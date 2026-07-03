const PREFIX = 'structable';

export type StoredColumnGroup = { id: string; label: string; childIds: string[] };
export type StoredSort = { col: string; dir: 'asc' | 'desc'; colType?: string };

function tableKey(tableId: string, name: string): string {
  return `${PREFIX}:${tableId}:${name}`;
}

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
  getColumnWidths: (tableId: string): Record<string, number>  => parse(tableKey(tableId, 'column-widths'), {}),
  setColumnWidths: (tableId: string, v: Record<string, number>) => store(tableKey(tableId, 'column-widths'), v),

  getColumnOrder: (tableId: string): string[]  => parse(tableKey(tableId, 'column-order'), []),
  setColumnOrder: (tableId: string, v: string[]) => store(tableKey(tableId, 'column-order'), v),

  getColumnGroups: (tableId: string): StoredColumnGroup[] => parse(tableKey(tableId, 'column-groups'), []),
  setColumnGroups: (tableId: string, v: StoredColumnGroup[]) => store(tableKey(tableId, 'column-groups'), v),

  getSort: (tableId: string): StoredSort | null => parse(tableKey(tableId, 'sort'), null),
  setSort: (tableId: string, v: StoredSort) => store(tableKey(tableId, 'sort'), v),

  getFilters: (tableId: string): Record<string, string> => parse(tableKey(tableId, 'filters'), {}),
  setFilters: (tableId: string, v: Record<string, string>) => store(tableKey(tableId, 'filters'), v),

  getPerPage: (tableId: string): number | null => parse(tableKey(tableId, 'per-page'), null),
  setPerPage: (tableId: string, v: number) => store(tableKey(tableId, 'per-page'), v),

  getShowRowNumbers: (tableId: string): boolean | null => parse(tableKey(tableId, 'show-row-numbers'), null),
  setShowRowNumbers: (tableId: string, v: boolean) => store(tableKey(tableId, 'show-row-numbers'), v),
};
