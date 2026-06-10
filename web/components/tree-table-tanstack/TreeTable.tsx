"use client";

import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type FilterFn,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import type { ColNode, ColType, RowData } from "@/lib/table-types";
import { formatNumberWithSpaces, formatNumericStringWithSpaces } from "@/lib/formatting";
import { useTableState } from "./use-table-state";
import { AddColumnDialog } from "@/components/tree-table/AddColumnDialog";
import { AiFillDialog } from "@/components/tree-table/AiFillDialog";
import { AiFillClassesDialog } from "@/components/tree-table/AiFillClassesDialog";
import { ColumnVisibilityPanel } from "@/components/tree-table/ColumnVisibilityPanel";

// --- filter functions ---

const numberMinFilter: FilterFn<RowData> = (row, columnId, filterValue) => {
  if (filterValue === '' || filterValue == null) return true;
  const val = row.getValue(columnId);
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) || num >= Number(filterValue);
};
numberMinFilter.autoRemove = (val: unknown) => val === '' || val == null;

const booleanFilter: FilterFn<RowData> = (row, columnId, filterValue) => {
  const val = row.getValue(columnId);
  return Boolean(val) === (filterValue === 'true');
};
booleanFilter.autoRemove = (val: unknown) => !val;

// --- column def builder ---

const NAME_COL: ColumnDef<RowData> = {
  id: "__name__",
  header: "Project",
  accessorKey: "name",
  enableHiding: false,
  filterFn: 'includesString',
};

function buildDefs(nodes: ColNode[]): ColumnDef<RowData>[] {
  return nodes.map((node): ColumnDef<RowData> => {
    if (node.children.length > 0) {
      return {
        id: node.id,
        header: node.name,
        columns: buildDefs(node.children),
        meta: { colType: node.colType },
      };
    }
    return {
      id: node.id,
      accessorFn: (row) => row[node.id],
      header: node.name,
      meta: { colType: node.colType },
      filterFn: node.colType === 'number' ? numberMinFilter
              : node.colType === 'boolean' ? booleanFilter
              : 'includesString',
    };
  });
}

// --- cell renderer ---

function CellValue({ value, colType }: { value: unknown; colType?: ColType }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-300 select-none">—</span>;
  }
  if (typeof value === "boolean" || colType === "boolean") {
    return value ? (
      <span className="text-green-600 font-semibold">✓</span>
    ) : (
      <span className="text-red-400 font-semibold">✗</span>
    );
  }
  if (typeof value === "number") {
    return <span className="tabular-nums">{formatNumberWithSpaces(value)}</span>;
  }
  if (colType === "number" && typeof value === "string") {
    return <span className="tabular-nums">{formatNumericStringWithSpaces(value) ?? value}</span>;
  }
  return <span>{String(value)}</span>;
}

// --- hidden-button label ---

function hiddenLabel(root: number, sub: number) {
  return [
    root > 0 && `${root} column${root !== 1 ? "s" : ""}`,
    sub > 0 && `${sub} sub-column${sub !== 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ") + " hidden";
}

// --- component ---

interface Props {
  initialColumns: ColNode[];
  initialRows: RowData[];
  /** Backend table ID — required to enable the AI fill feature. */
  tableId?: string | null;
}

export function TreeTable({ initialColumns, initialRows, tableId }: Props) {
  const { columns, rows, columnVisibility, hiddenCounts, userHiddenIds, columnFilters, setColumnFilters, addColumn, hideColumn, showColumn } =
    useTableState(initialColumns, initialRows);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showHiddenPanel, setShowHiddenPanel] = useState(false);
  const [showAiFill, setShowAiFill] = useState(false);
  const [showAiFillClasses, setShowAiFillClasses] = useState(false);

  const columnDefs = useMemo(() => [NAME_COL, ...buildDefs(columns)], [columns]);

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { columnVisibility, columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const hasFilters = columnFilters.length > 0;

  const headerGroups = table.getHeaderGroups();
  const totalDepth = headerGroups.length;
  const hiddenTotal = hiddenCounts.root + hiddenCounts.sub;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 font-medium"
        >
          + Add column
        </button>
        {tableId && (
          <>
            <button
              onClick={() => setShowAiFill(true)}
              className="px-3 py-1.5 text-sm border rounded-md font-medium bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
            >
              ✦ AI Fill
            </button>
            <button
              onClick={() => setShowAiFillClasses(true)}
              className="px-3 py-1.5 text-sm border rounded-md font-medium bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
            >
              ✦ AI Fill Classes
            </button>
          </>
        )}
        {hasFilters && (
          <button
            onClick={() => setColumnFilters([])}
            className="px-3 py-1.5 text-sm border rounded-md text-red-600 border-red-200 hover:bg-red-50"
          >
            Clear filters
          </button>
        )}
        <div className="relative">
          {hiddenTotal > 0 && (
            <button
              onClick={() => setShowHiddenPanel((v) => !v)}
              className="px-3 py-1.5 text-sm border rounded-md bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
            >
              {hiddenLabel(hiddenCounts.root, hiddenCounts.sub)}
            </button>
          )}
          {showHiddenPanel && (
            <ColumnVisibilityPanel
              columns={columns}
              userHiddenIds={userHiddenIds}
              onShow={(id) => { showColumn(id); }}
              onClose={() => setShowHiddenPanel(false)}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="border-collapse text-sm" style={{ minWidth: "max-content" }}>
          <thead>
            {headerGroups.map((headerGroup, groupIdx) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers
                  .filter((h) => !h.isPlaceholder)
                  .map((header) => {
                    const isName = header.column.id === "__name__";
                    const isLeaf = header.column.getLeafColumns().length === 1;
                    const rowSpan = isLeaf ? totalDepth - groupIdx : 1;
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        className={[
                          "px-3 py-2 border-b border-r text-left font-semibold whitespace-nowrap",
                          "text-xs uppercase tracking-wide text-gray-500 bg-gray-50",
                          isName ? "sticky left-0 z-20" : "group/th",
                        ].join(" ")}
                        style={{ minWidth: isName ? 160 : 110 }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </span>
                          {!isName && (
                            <button
                              onClick={() => hideColumn(header.column.id)}
                              title="Hide"
                              className="opacity-0 group-hover/th:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 text-xs leading-none"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
              </tr>
            ))}
            {/* Filter row */}
            <tr>
              {table.getVisibleLeafColumns().map((col) => {
                const isName = col.id === '__name__';
                const colType = col.columnDef.meta?.colType;
                const filterValue = (col.getFilterValue() ?? '') as string;
                return (
                  <th
                    key={col.id}
                    className={[
                      'px-2 py-1.5 border-b-2 border-r border-orange-100 bg-orange-50/40',
                      isName ? 'sticky left-0 z-20' : '',
                    ].join(' ')}
                    style={{ minWidth: isName ? 160 : 110 }}
                  >
                    {colType === 'boolean' ? (
                      <select
                        value={filterValue || 'all'}
                        onChange={(e) => col.setFilterValue(e.target.value === 'all' ? undefined : e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                      >
                        <option value="all">All</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        type={colType === 'number' ? 'number' : 'text'}
                        placeholder={colType === 'number' ? 'Min…' : 'Filter…'}
                        value={filterValue}
                        onChange={(e) => col.setFilterValue(e.target.value || undefined)}
                        className="w-full text-xs border border-gray-200 rounded px-1.5 py-0.5 min-w-0 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                {row.getVisibleCells().map((cell) => {
                  const isName = cell.column.id === "__name__";
                  const colType = cell.column.columnDef.meta?.colType;
                  return (
                    <td
                      key={cell.id}
                      className={[
                        "px-3 py-2 border-b border-r text-sm",
                        isName
                          ? "sticky left-0 z-10 bg-white font-medium text-gray-900"
                          : "bg-white text-gray-700",
                      ].join(" ")}
                      style={{ minWidth: isName ? 160 : 110 }}
                    >
                      {isName ? (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      ) : (
                        <CellValue value={cell.getValue()} colType={colType} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddDialog && (
        <AddColumnDialog
          columns={columns}
          onAdd={(name, colType, parentId) => {
            addColumn(name, colType, parentId);
            setShowAddDialog(false);
          }}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {showAiFill && tableId && (
        <AiFillDialog
          tableId={tableId}
          columns={columns}
          onClose={() => setShowAiFill(false)}
        />
      )}
      {showAiFillClasses && tableId && (
        <AiFillClassesDialog
          tableId={tableId}
          onClose={() => setShowAiFillClasses(false)}
        />
      )}
    </div>
  );
}
