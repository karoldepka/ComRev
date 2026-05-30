import TablePage from '../../../components/TablePage';

export default async function Page({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return (
    <main className="page-shell">
      <TablePage tableId={tableId} />
    </main>
  );
}
