"use client";

import { useState } from "react";
import { DEMO_COLUMNS, DEMO_ROWS } from "@/lib/demo-data";
import { TreeTable } from "@/components/tree-table-tanstack/TreeTable";
import { AgGridTable } from "@/components/tree-table-aggrid/AgGridTable";

const TABS = [
  { label: "TanStack Table v8", desc: "Headless — full CSS control, rowSpan headers" },
  { label: "AG Grid Community", desc: "Batteries-included — pinned column, resizable" },
];

interface Props {
  slug: string;
}

export function CompareClient({ slug }: Props) {
  const [tab, setTab] = useState(0);

  return (
    <main className="p-6 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">
        {slug === "demo" ? "React State Management Libraries" : slug}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Demo data — compare two treetable implementations
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setTab(i)}
            className={[
              "px-4 py-2 text-sm rounded-md transition-colors",
              tab === i
                ? "bg-white shadow-sm font-medium text-gray-900"
                : "text-gray-500 hover:text-gray-800",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mb-4">{TABS[tab].desc}</p>

      {tab === 0 && <TreeTable initialColumns={DEMO_COLUMNS} initialRows={DEMO_ROWS} />}
      {tab === 1 && <AgGridTable initialColumns={DEMO_COLUMNS} initialRows={DEMO_ROWS} />}
    </main>
  );
}
