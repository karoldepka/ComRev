'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import TableToolbar from './TableToolbar';
import AddTableDialog, { type AddTablePayload } from './AddTableDialog';
import TreeTable from './TreeTable';
import ChatPanel from './ChatPanel';
import { getSyncClient } from '../services/syncClient';
import type { ApiTable } from '../types/table';

type Props = { tableId: string };

export default function TablePage({ tableId }: Props) {
  const router = useRouter();
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [showAddTable, setShowAddTable] = useState(false);
  const [searchOpenRequest, setSearchOpenRequest] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    getSyncClient()
      .then((c) => c.fetchTables())
      .then(setTables)
      .catch((err: unknown) => toast.error(`Failed to load tables: ${err instanceof Error ? err.message : String(err)}`));
  }, []);

  const handleCreateTable = useCallback((payload: AddTablePayload) => {
    const id = payload.customId ?? nanoid();
    getSyncClient()
      .then((c) => c.createTable({ id, title: payload.title, tagline: payload.tagline, description: payload.description }))
      .catch((err: unknown) => toast.error(`Failed to create table: ${err instanceof Error ? err.message : String(err)}`));
    setTables((prev) => [...prev, { id, title: payload.title, tagline: payload.tagline, description: payload.description }]);
    setShowAddTable(false);
    router.push(`/t/${id}`);
  }, [router]);

  const handleRenameTable = useCallback((id: string, title: string) => {
    getSyncClient()
      .then((c) => c.patchTable(id, { title }))
      .catch((err: unknown) => toast.error(`Failed to rename table: ${err instanceof Error ? err.message : String(err)}`));
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const handleNukeUserData = useCallback(async () => {
    const client = await getSyncClient();
    await client.nukeUserData();
    toast.success('User data deleted. Reload to see an empty table.');
  }, []);

  const handleNukeDb = useCallback(async () => {
    const client = await getSyncClient();
    await client.nukeDb();
    toast.success('Database nuked. Reload to start fresh.');
  }, []);

  const currentTable = tables.find((t) => t.id === tableId);
  const chatSystemPrompt = currentTable
    ? `You are a helpful assistant for a table called "${currentTable.title ?? tableId}" in Structable, an open-source alternative to Airtable. Help the user understand, analyze, and work with their data.`
    : undefined;

  return (
    <>
      <TableToolbar
        tableId={tableId}
        tables={tables}
        onAddTable={() => setShowAddTable(true)}
        onOpenSearch={() => setSearchOpenRequest((request) => request + 1)}
        onShowAllTables={() => router.push('/')}
        onRenameTable={handleRenameTable}
        onNukeUserData={handleNukeUserData}
        onNukeDb={handleNukeDb}
        onToggleChat={() => setChatOpen((v) => !v)}
        chatOpen={chatOpen}
      />
      {showAddTable && (
        <AddTableDialog
          onConfirm={handleCreateTable}
          onClose={() => setShowAddTable(false)}
        />
      )}
      <div className="table-chat-layout">
        <div className="table-main">
          <TreeTable
            tableId={tableId}
            searchOpenRequest={searchOpenRequest}
            onRowClick={tableId === 'tables' ? (id) => router.push(`/t/${id}`) : undefined}
          />
        </div>
        {chatOpen && (
          <ChatPanel
            onClose={() => setChatOpen(false)}
            systemPrompt={chatSystemPrompt}
          />
        )}
      </div>
    </>
  );
}
