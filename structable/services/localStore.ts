const KEYS = {
  columnWidths: 'structable:column-widths',
  columnOrder:  'structable:column-order',
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
};
