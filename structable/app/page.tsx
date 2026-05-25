import TreeTable from '../components/TreeTable';

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Next.js React Tree Table</p>
          <h1>Resizable grouped columns with multi-cell selection</h1>
          <p>Click header or data cells to select. Use Ctrl/Cmd + click to select multiple cells.</p>
        </div>
      </section>
      <div className="table-shell">
        <TreeTable />
      </div>
    </main>
  );
}
