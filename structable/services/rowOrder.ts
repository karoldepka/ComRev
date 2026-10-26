import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { DataRow } from '../types/table';

/**
 * Manual row order. Top-level rows carry a fractional-index key in the built-in `position` field
 * (any client can insert between two keys without renumbering others — safe offline/concurrently).
 * Child rows are ordered by their parent's `parent_child` list instead.
 */
export const POSITION_FIELD = 'position';
export const MANUAL_ORDER_SORT = { col: POSITION_FIELD, dir: 'asc' } as const;

export type MoveDelta = -1 | 1;

const rowId = (row: DataRow): string => String(row['id'] ?? '');
const positionOf = (row: DataRow): string | null => {
  const value = row[POSITION_FIELD];
  return typeof value === 'string' && value ? value : null;
};

/** Keys compare bytewise (backend uses COLLATE "C"); JS `<` on ASCII strings agrees. */
const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * New positions after moving `id` one step among `siblings` (in display order).
 * Only the moved row changes when its neighbours are already ordered; otherwise (first manual move,
 * or `adoptDisplayOrder`) every sibling gets a key so the displayed order becomes the manual order.
 * Empty map = nothing to move.
 */
export function planSiblingMove(siblings: DataRow[], id: string, delta: MoveDelta, adoptDisplayOrder = false): Map<string, string> {
  const from = siblings.findIndex((row) => rowId(row) === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= siblings.length) return new Map();
  const reordered = [...siblings];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  const others = reordered.filter((row) => row !== moved).map(positionOf);
  const othersOrdered = others.every((key, i) => key !== null && (i === 0 || compareKeys(others[i - 1]!, key) < 0));
  if (othersOrdered && !adoptDisplayOrder) {
    const before = to > 0 ? positionOf(reordered[to - 1]) : null;
    const after = to < reordered.length - 1 ? positionOf(reordered[to + 1]) : null;
    return new Map([[id, generateKeyBetween(before, after)]]);
  }
  const keys = generateNKeysBetween(null, null, reordered.length);
  const changes = new Map<string, string>();
  reordered.forEach((row, i) => {
    if (positionOf(row) !== keys[i]) changes.set(rowId(row), keys[i]);
  });
  return changes;
}

/** `childIds` with `id` moved past its neighbour among `visibleSiblingIds` (hidden ids keep their slots). */
export function planChildMove(childIds: string[], visibleSiblingIds: string[], id: string, delta: MoveDelta): string[] | null {
  const neighbourId = visibleSiblingIds[visibleSiblingIds.indexOf(id) + delta];
  if (!neighbourId || !childIds.includes(id)) return null;
  const next = childIds.filter((childId) => childId !== id);
  const neighbourIndex = next.indexOf(neighbourId);
  next.splice(delta < 0 ? neighbourIndex : neighbourIndex + 1, 0, id);
  return next;
}

/** Rows in manual order: positioned rows by key, then the rest in their current (creation) order. */
export function sortByPosition(rows: DataRow[]): DataRow[] {
  return rows
    .map((row, index) => ({ row, index, key: positionOf(row) }))
    .sort((a, b) => (a.key && b.key ? compareKeys(a.key, b.key) : a.key ? -1 : b.key ? 1 : 0) || a.index - b.index)
    .map(({ row }) => row);
}
