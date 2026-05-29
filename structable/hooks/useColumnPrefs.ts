import { useCallback, useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { localStore } from '../services/localStore';
import type { StoredColumnGroup } from '../services/localStore';

export type ColumnGroup = StoredColumnGroup;

export function useColumnPrefs() {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => localStore.getColumnWidths(),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => localStore.getColumnOrder(),
  );
  const [columnGroups, setColumnGroups] = useState<ColumnGroup[]>(
    () => localStore.getColumnGroups(),
  );

  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) localStore.setColumnWidths(columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    localStore.setColumnGroups(columnGroups);
  }, [columnGroups]);

  const reorderColumns = useCallback((fromId: string, toId: string, allLeafIds: string[]) => {
    const next = allLeafIds.filter((id) => id !== fromId);
    const toIdx = next.indexOf(toId);
    if (toIdx === -1) return;
    next.splice(toIdx, 0, fromId);
    setColumnOrder(next);
    localStore.setColumnOrder(next);
  }, []);

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
    columnGroups,
    addColumnGroup,
    addToGroup,
    removeColumnGroup,
    updateGroupLabel,
  };
}
