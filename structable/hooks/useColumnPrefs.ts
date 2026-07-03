import { useCallback, useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { localStore } from '../services/localStore';
import type { StoredColumnGroup } from '../services/localStore';

export type ColumnGroup = StoredColumnGroup;

export function useColumnPrefs(tableId: string) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => localStore.getColumnWidths(tableId),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => localStore.getColumnOrder(tableId),
  );
  const [columnGroups, setColumnGroups] = useState<ColumnGroup[]>(
    () => localStore.getColumnGroups(tableId),
  );

  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) localStore.setColumnWidths(tableId, columnWidths);
  }, [tableId, columnWidths]);

  useEffect(() => {
    localStore.setColumnGroups(tableId, columnGroups);
  }, [tableId, columnGroups]);

  const reorderColumns = useCallback((fromId: string, toId: string, allLeafIds: string[]) => {
    const next = allLeafIds.filter((id) => id !== fromId);
    const toIdx = next.indexOf(toId);
    if (toIdx === -1) return;
    next.splice(toIdx, 0, fromId);
    setColumnOrder(next);
    localStore.setColumnOrder(tableId, next);
  }, [tableId]);

  const moveColumnsToLeftEdge = useCallback((colIds: string[], allLeafIds: string[]) => {
    const colIdSet = new Set(colIds);
    const moving = allLeafIds.filter((id) => colIdSet.has(id));
    const rest = allLeafIds.filter((id) => !colIdSet.has(id));
    const next = [...moving, ...rest];
    setColumnOrder(next);
    localStore.setColumnOrder(tableId, next);
  }, [tableId]);

  const insertColumnAfter = useCallback((newColId: string, afterColId: string | null) => {
    setColumnOrder((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const idx = afterColId ? prev.indexOf(afterColId) : -1;
      next.splice(idx >= 0 ? idx + 1 : next.length, 0, newColId);
      localStore.setColumnOrder(tableId, next);
      return next;
    });
  }, [tableId]);

  const addColumnGroup = useCallback((label: string, childIds: string[]) => {
    setColumnGroups((prev) => {
      // Remove these children from any existing groups; dissolve groups that drop below 2
      const updated = prev
        .map((g) => ({ ...g, childIds: g.childIds.filter((id) => !childIds.includes(id)) }))
        .filter((g) => g.childIds.length >= 2);
      return [...updated, { id: nanoid(), label, childIds }];
    });
  }, []);

  const addToGroup = useCallback((groupId: string, childId: string) => {
    setColumnGroups((prev) =>
      prev
        .map((g) => {
          if (g.id === groupId) {
            return { ...g, childIds: [...g.childIds.filter((id) => id !== childId), childId] };
          }
          return { ...g, childIds: g.childIds.filter((id) => id !== childId) };
        })
        .filter((g) => g.childIds.length >= 2),
    );
  }, []);

  const removeColumnGroup = useCallback((groupId: string) => {
    setColumnGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const updateGroupLabel = useCallback((groupId: string, label: string) => {
    setColumnGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, label } : g)));
  }, []);

  return {
    columnWidths, setColumnWidths,
    columnOrder, setColumnOrder,
    reorderColumns,
    moveColumnsToLeftEdge,
    insertColumnAfter,
    columnGroups,
    addColumnGroup,
    addToGroup,
    removeColumnGroup,
    updateGroupLabel,
  };
}
