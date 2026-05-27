export type ColType = 'numeric' | 'text' | 'categorical' | 'boolean';

export function colType(key: string): ColType | null {
  if (key.endsWith('_at') || key === 'id' || key === 'gh_id') return null;
  if (key === 'archived' || key === 'disabled') return 'boolean';
  if (['name', 'description'].includes(key)) return 'text';
  if (['language', 'license', 'visibility', 'owner_login'].includes(key)) return 'categorical';
  if (
    key === 'stars' || key === 'forks' || key === 'open_issues' || key === 'size' ||
    key === 'stars_now' || key.startsWith('stars_diff_')
  ) return 'numeric';
  return null;
}

export function colFilterParam(key: string): string | null {
  const t = colType(key);
  if (t === 'text') return 'q';
  if (t === 'numeric') return `${key}_min`;
  if (t === 'categorical' || t === 'boolean') return key;
  return null;
}

export function colFilterPlaceholder(key: string): string {
  const t = colType(key);
  if (t === 'numeric') return 'Min value…';
  if (t === 'text') return 'Search name / description…';
  if (t === 'categorical') return 'Exact value (comma = OR)…';
  return 'Value…';
}
