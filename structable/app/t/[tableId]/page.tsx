import TreeTable from '../../../components/TreeTable';

export default async function TablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return (
    <main className="page-shell">
      <div className="table-shell">
        <TreeTable tableId={tableId} />
      </div>
    </main>
  );
}
