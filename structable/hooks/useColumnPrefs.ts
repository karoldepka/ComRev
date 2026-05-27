import { useCallback, useEffect, useState } from 'react';
import { localStore } from '../services/localStore';

export function useColumnPrefs() {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => localStore.getColumnWidths(),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => localStore.getColumnOrder(),
  );

  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) localStore.setColumnWidths(columnWidths);
  }, [columnWidths]);

  const reorderColumns = useCallback((fromId: string, toId: string, allLeafIds: string[]) => {
    const next = allLeafIds.filter((id) => id !== fromId);
    const toIdx = next.indexOf(toId);
    if (toIdx === -1) return;
    next.splice(toIdx, 0, fromId);
    setColumnOrder(next);
    localStore.setColumnOrder(next);
  }, []);

  return { columnWidths, setColumnWidths, columnOrder, setColumnOrder, reorderColumns };
}
