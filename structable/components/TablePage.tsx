'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import TableToolbar from './TableToolbar';
import AddTableDialog, { type AddTablePayload } from './AddTableDialog';
import TreeTable from './TreeTable';
import { getSyncClient } from '../services/syncClient';
import type { ApiTable } from '../types/table';

type Props = { tableId: string };

export default function TablePage({ tableId }: Props) {
  const router = useRouter();
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [showAddTable, setShowAddTable] = useState(false);

  useEffect(() => {
    getSyncClient()
      .then((c) => c.fetchTables())
      .then(setTables)
      .catch((err: unknown) => toast.error(`Failed to load tables: ${err instanceof Error ? err.message : String(err)}`));
  }, []);

  const handleCreateTable = useCallback((payload: AddTablePayload) => {
    const id = payload.customId ?? nanoid();
    getSyncClient()
      .then((c) => c.createTable({ id, title: payload.title, description: payload.description }))
      .catch((err: unknown) => toast.error(`Failed to create table: ${err instanceof Error ? err.message : String(err)}`));
    setTables((prev) => [...prev, { id, title: payload.title, description: payload.description }]);
    setShowAddTable(false);
    router.push(`/t/${id}`);
  }, [router]);

  const handleRenameTable = useCallback((id: string, title: string) => {
    getSyncClient()
      .then((c) => c.patchTable(id, { title }))
      .catch((err: unknown) => toast.error(`Failed to rename table: ${err instanceof Error ? err.message : String(err)}`));
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const handleNukeDb = useCallback(async () => {
    const client = await getSyncClient();
    await client.nukeDb();
    toast.success('Database nuked. Reload to start fresh.');
  }, []);

  return (
    <>
      <TableToolbar
        tableId={tableId}
        tables={tables}
        onAddTable={() => setShowAddTable(true)}
        onShowAllTables={() => router.push('/')}
        onRenameTable={handleRenameTable}
        onNukeDb={handleNukeDb}
      />
      {showAddTable && (
        <AddTableDialog
          onConfirm={handleCreateTable}
          onClose={() => setShowAddTable(false)}
        />
      )}
      <TreeTable
        tableId={tableId}
        onRowClick={tableId === 'tables' ? (id) => router.push(`/t/${id}`) : undefined}
      />
    </>
  );
}
