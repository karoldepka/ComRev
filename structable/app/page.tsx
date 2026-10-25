import TablePage from '../components/ClientTablePage';

export default function Home() {
  return (
    <main className="page-shell">
      <TablePage tableId="tables" />
    </main>
  );
}
