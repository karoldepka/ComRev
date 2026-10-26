import { useEffect, useMemo, useState } from 'react';
import { MANUAL_ORDER_SORT } from '../services/rowOrder';
import type { SyncClient } from '../services/syncClient';
import type { DataRow } from '../types/table';
import logger from '../utils/logger';

/** Reference targets are small lookup tables (statuses, categories); one page is enough. */
const MAX_REFERENCE_ROWS = 200;
const RETRY_MS = 5000;

/**
 * Rows of every table referenced by a reference column, in manual order (the picker order).
 * Retries failed loads; keeps the last good rows meanwhile.
 */
export function useReferenceRows(api: SyncClient | null, refTableIds: string[]): Map<string, DataRow[]> {
  const [rowsByTable, setRowsByTable] = useState<Map<string, DataRow[]>>(new Map());
  const key = useMemo(() => [...new Set(refTableIds)].sort().join('|'), [refTableIds]);

  useEffect(() => {
    if (!api || !key) return;
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const load = (tableId: string) => {
      const params = new URLSearchParams({ page: '1', per_page: String(MAX_REFERENCE_ROWS), sort: `${MANUAL_ORDER_SORT.col}:${MANUAL_ORDER_SORT.dir}` });
      api.fetchDataRows(tableId, params)
        .then((payload) => {
          if (active) setRowsByTable((prev) => new Map(prev).set(tableId, payload.data));
        })
        .catch((err: unknown) => {
          logger.error({ err, tableId }, 'reference rows: load failed, retrying');
          if (active) timers.push(setTimeout(() => load(tableId), RETRY_MS));
        });
    };
    key.split('|').forEach(load);
    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  }, [api, key]);

  return rowsByTable;
}
