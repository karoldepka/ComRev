'use client';

import React, { useEffect, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import type { RepoRow } from '../types/table';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const helper = createColumnHelper<RepoRow>();

const COLUMNS = [
  helper.accessor('name',           { header: 'Repo',         size: 220 }),
  helper.accessor('description',    { header: 'Description',  size: 320 }),
  helper.accessor('owner_login',    { header: 'Owner',        size: 130 }),
  helper.accessor('language',       { header: 'Language',     size: 120 }),
  helper.accessor('stars',          { header: 'Stars',        size: 90  }),
  helper.accessor('forks',          { header: 'Forks',        size: 80  }),
  helper.accessor('open_issues',    { header: 'Issues',       size: 80  }),
  helper.accessor('stars_diff_14d', { header: '±14d',         size: 80  }),
  helper.accessor('stars_diff_30d', { header: '±30d',         size: 80  }),
  helper.accessor('pushed_at',      { header: 'Pushed',       size: 170 }),
  helper.accessor('language',       { id: 'language2', header: 'Lang',  size: 80  }),
];

export default function TanStackTable() {
  const [data, setData] = useState<RepoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'stars_diff_14d', desc: true }]);
  const perPage = 50;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const s = sorting[0];
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort: s ? `${s.id}:${s.desc ? 'desc' : 'asc'}` : 'stars_diff_14d:desc',
    });
    fetch(`${API_BASE}/repos?${params}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((payload) => { setData(payload.data); setTotal(payload.total); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, [page, sorting]);

  const table = useReactTable({
    data,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (error) return <div style={{ padding: '1rem', color: 'red' }}>Error: {error}</div>;

  return (
    <div className="tree-table-container">
      {loading && <div className="table-loading-overlay"><span>Loading…</span></div>}
      <div className="tree-table-wrap">
        <table className="tree-table">
          <colgroup>
            {table.getFlatHeaders().map((h) => (
              <col key={h.id} style={{ width: `${h.getSize()}px` }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    style={{ cursor: h.column.getCanSort() ? 'pointer' : undefined }}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <div className="column-group">
                      <span className="col-label">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === 'asc' && <span className="sort-indicator"> ↑</span>}
                        {h.column.getIsSorted() === 'desc' && <span className="sort-indicator"> ↓</span>}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-note">
        <span>{total.toLocaleString()} repos — page {page} of {totalPages}</span>
        <span style={{ marginLeft: '1rem' }}>
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</button>
          {' '}
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</button>
        </span>
      </div>
    </div>
  );
}
