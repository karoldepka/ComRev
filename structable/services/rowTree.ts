import type { SyncClient } from './syncClient';
import type { DataRow } from '../types/table';

/** Relation field holding a row's ordered child ids (same for data rows and the tables registry). */
export const PARENT_CHILD_FIELD = 'parent_child';

const PAGE_SIZE = 200; // server maximum per page

const rowId = (row: DataRow): string => String(row['id'] ?? '');

export const childIdsOf = (row: DataRow | undefined): string[] => {
  const value = row?.[PARENT_CHILD_FIELD];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
};

/** Every row of the table (all pages): moves must see parents that aren't on the loaded page. */
export async function fetchAllRows(api: SyncClient, tableId: string): Promise<DataRow[]> {
  const rows: DataRow[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE), sort: 'when_created:asc' });
    const payload = await api.fetchDataRows(tableId, params);
    rows.push(...payload.data);
    if (payload.data.length === 0 || rows.length >= payload.total) return rows;
  }
}

/** Ids of all rows below `id` in the tree (cycle-safe). */
export function descendantIds(rows: DataRow[], id: string): Set<string> {
  const childrenById = new Map(rows.map((row) => [rowId(row), childIdsOf(row)]));
  const found = new Set<string>();
  const stack = [...(childrenById.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...(childrenById.get(next) ?? []));
  }
  return found;
}

/** Rows as a tree-ordered picker list (depth + parentId), leaving out `excludeIds`. */
export function treePickerItems(
  rows: DataRow[],
  excludeIds: Set<string>,
  label: (row: DataRow) => string,
): { id: string; label: string; depth: number; parentId: string | null }[] {
  const parentById = new Map<string, string>();
  for (const row of rows) for (const childId of childIdsOf(row)) if (!parentById.has(childId)) parentById.set(childId, rowId(row));
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const parentId = parentById.get(id);
    if (!parentId || seen.has(parentId)) return 0;
    seen.add(id);
    return 1 + depthOf(parentId, seen);
  };
  return rows
    .filter((row) => rowId(row) && !excludeIds.has(rowId(row)))
    .map((row) => ({ id: rowId(row), label: label(row), depth: depthOf(rowId(row)), parentId: parentById.get(rowId(row)) ?? null }));
}

/**
 * New parent_child lists that make `id` a child of `newParentId` (null = top level) and of nothing else.
 * Returns only the rows that change; throws if the move would create a cycle.
 */
export function planMove(rows: DataRow[], id: string, newParentId: string | null): Map<string, string[]> {
  if (newParentId === id || (newParentId && descendantIds(rows, id).has(newParentId))) {
    throw new Error('Cannot move a row under itself or one of its descendants');
  }
  const changes = new Map<string, string[]>();
  for (const row of rows) {
    const parentId = rowId(row);
    const childIds = childIdsOf(row);
    if (parentId === newParentId) {
      if (!childIds.includes(id)) changes.set(parentId, [...childIds, id]);
    } else if (childIds.includes(id)) {
      changes.set(parentId, childIds.filter((childId) => childId !== id));
    }
  }
  return changes;
}

/** Persist a planned move. The new parent is written first so a partial failure never orphans the row. */
export async function applyMove(api: SyncClient, tableId: string, changes: Map<string, string[]>, newParentId: string | null): Promise<void> {
  const ordered = [...changes].sort(([a], [b]) => Number(b === newParentId) - Number(a === newParentId));
  for (const [parentId, childIds] of ordered) {
    await api.setManyToMany(tableId, parentId, PARENT_CHILD_FIELD, childIds);
  }
}
