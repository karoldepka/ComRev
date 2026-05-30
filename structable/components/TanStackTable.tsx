'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import type { DataRow } from '../types/table';
import TableToolbar from './TableToolbar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const helper = createColumnHelper<DataRow>();

function labelFor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TanStackTable() {
  const [data, setData] = useState<DataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'when_created', desc: true }]);
  const perPage = 50;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const s = sorting[0];
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort: s ? `${s.id}:${s.desc ? 'desc' : 'asc'}` : 'when_created:desc',
    });
    fetch(`${API_BASE}/repos?${params}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((payload) => { setData(payload.data); setTotal(payload.total); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, [page, sorting]);

  const columns = useMemo(() => {
    const first = data[0];
    const keys = first ? Object.keys(first) : ['id', 'when_created'];
    return keys.map((key) => helper.accessor(key, { header: labelFor(key), size: 120 }));
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (error) {
    return (
      <>
        <TableToolbar title="TanStack Table" />
        <div style={{ padding: '1rem', color: 'red' }}>Error: {error}</div>
      </>
    );
  }

  return (
    <>
      <TableToolbar title="TanStack Table" />
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
    </>
  );
}
