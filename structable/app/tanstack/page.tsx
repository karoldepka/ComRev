import TanStackTable from '../../components/TanStackTable';

export default function TanStackPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">TanStack Table v8</p>
          <h1>Same data, library renderer</h1>
          <p>Click column headers to sort. Compare feature parity and feel against the Custom TreeTable.</p>
        </div>
      </section>
      <div className="table-shell">
        <TanStackTable />
      </div>
    </main>
  );
}
