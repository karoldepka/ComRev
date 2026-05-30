'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import TableToolbar from './TableToolbar';
import AddTableDialog, { type AddTablePayload } from './AddTableDialog';
import TreeTable from './TreeTable';
import { TableApi } from '../services/tableApi';
import type { ApiTable } from '../types/table';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Props = { tableId: string };

export default function TablePage({ tableId }: Props) {
  const router = useRouter();
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [showAddTable, setShowAddTable] = useState(false);

  // Dedicated API client for table-level CRUD (separate from the per-table row/cell API).
  const tableApiRef = useRef<TableApi | null>(null);
  if (!tableApiRef.current) {
    tableApiRef.current = new TableApi({
      baseUrl: API_BASE,
      tableId: '_page',
      onError: (msg) => toast.error(msg),
    });
  }

  useEffect(() => {
    tableApiRef.current!.fetchTables()
      .then(setTables)
      .catch((err: unknown) => toast.error(`Failed to load tables: ${err instanceof Error ? err.message : String(err)}`));
  }, []);

  const handleCreateTable = useCallback((payload: AddTablePayload) => {
    const id = nanoid();
    tableApiRef.current!.createTable({ id, title: payload.title, description: payload.description });
    setTables((prev) => [...prev, { id, title: payload.title, description: payload.description }]);
    setShowAddTable(false);
    router.push(`/t/${id}`);
  }, [router]);

  const handleRenameTable = useCallback((id: string, title: string) => {
    tableApiRef.current!.patchTable(id, { title });
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  return (
    <>
      <TableToolbar
        tableId={tableId}
        tables={tables}
        onAddTable={() => setShowAddTable(true)}
        onShowAllTables={() => toast.info('Table list coming soon')}
        onRenameTable={handleRenameTable}
      />
      {showAddTable && (
        <AddTableDialog
          onConfirm={handleCreateTable}
          onClose={() => setShowAddTable(false)}
        />
      )}
      <TreeTable tableId={tableId} />
    </>
  );
}
