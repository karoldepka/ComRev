export type ColType = 'numeric' | 'text' | 'categorical' | 'boolean';

export function colType(col: { filterType?: ColType | null }): ColType | null {
  return col.filterType ?? null;
}

export function colFilterParam(col: { id: string; filterType?: ColType | null }): string | null {
  const t = col.filterType;
  if (t === 'text') return 'q';
  if (t === 'numeric') return `${col.id}_min`;
  if (t === 'categorical' || t === 'boolean') return col.id;
  return null;
}

export function colFilterPlaceholder(col: { filterType?: ColType | null }): string {
  const t = col.filterType;
  if (t === 'numeric') return 'Min value…';
  if (t === 'text') return 'Search name / description…';
  if (t === 'categorical') return 'Exact value (comma = OR)…';
  return 'Value…';
}
