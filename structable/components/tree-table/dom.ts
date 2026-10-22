/** Human-readable message for an API/gRPC error. */
export function errMsg(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
  // Tonic gRPC-web errors: 'status: Unknown, message: "js api error: TypeError: Failed to fetch"'
  if (raw.includes('js api error') && raw.includes('Failed to fetch')) return 'Cannot reach server';
  return raw;
}

/** Body-cell key under a mouse target, or null when drag-select should not apply there. */
export function dragSelectKeyFromTarget(target: EventTarget): string | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest('input, textarea, select, button, a, [contenteditable], [role="textbox"], .resizer')) return null;
  const key = target.closest<HTMLElement>('[data-key]')?.dataset.key;
  return key?.startsWith('cell:') ? key : null;
}
