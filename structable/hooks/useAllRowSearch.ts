import { useEffect, useState } from 'react';
import type { SyncClient } from '../services/syncClient';
import type { StoredSort } from '../services/localStore';
import type { ApiCustomColumn, DataRow } from '../types/table';
import { sortParam } from '../components/tree-table/columns';
import { errMsg } from '../components/tree-table/dom';

const MAX_ROWS = 20;

export type AllRowSearchState = {
  query: string;
  loading: boolean;
  rows: DataRow[];
  total: number;
  error: string | null;
};

type Params = {
  api: SyncClient | null;
  enabled: boolean;
  term: string;
  tableId: string;
  filters: Record<string, string>;
  sort: StoredSort;
  customColumns: ApiCustomColumn[];
};

/** Server-side search across all rows of the table (not just the loaded page). Pass an already-debounced `term`. */
export function useAllRowSearch({ api, enabled, term, tableId, filters, sort, customColumns }: Params): AllRowSearchState {
  const [state, setState] = useState<AllRowSearchState>({ query: '', loading: false, rows: [], total: 0, error: null });

  useEffect(() => {
    if (!api || !enabled || term.length === 0) {
      setState({ query: term, loading: false, rows: [], total: 0, error: null });
      return;
    }

    let active = true;
    setState((prev) => ({
      query: term,
      loading: prev.query !== term || prev.loading,
      rows: prev.query === term ? prev.rows : [],
      total: prev.query === term ? prev.total : 0,
      error: null,
    }));

    const params = new URLSearchParams({ page: '1', per_page: String(MAX_ROWS), q: term });
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== 'q') params.set(key, value);
    });
    params.set('sort', sortParam(sort, customColumns));

    api.fetchDataRows(tableId, params)
      .then((payload) => {
        if (active) setState({ query: term, loading: false, rows: payload.data, total: payload.total, error: null });
      })
      .catch((err: unknown) => {
        if (active) setState({ query: term, loading: false, rows: [], total: 0, error: errMsg(err) });
      });

    return () => {
      active = false;
    };
  }, [api, enabled, term, sort, tableId, customColumns, filters]);

  return state;
}
