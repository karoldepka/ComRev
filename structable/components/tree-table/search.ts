import { rowVal } from '../../utils/rowVal';
import type { DataRow } from '../../types/table';
import { FULL_NAME_COL_ID, type Column, type TreeRow } from './columns';

const MAX_COLUMN_RESULTS = 8;
const MAX_ROW_RESULTS = 16;

export type GlobalSearchResult =
  | {
      id: string;
      kind: 'column';
      columnId: string;
      title: string;
      detail: string;
      hidden: boolean;
    }
  | {
      id: string;
      kind: 'displayed-row';
      rowIndex: number;
      rowId: string;
      columnId: string;
      title: string;
      detail: string;
    }
  | {
      id: string;
      kind: 'all-row';
      rowId: string;
      columnId: string | null;
      title: string;
      detail: string;
    };

export function searchText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(searchText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

export function rowTitle(row: DataRow): string {
  const title = rowVal(row, FULL_NAME_COL_ID) ?? rowVal(row, 'fullName') ?? rowVal(row, 'name') ?? rowVal(row, 'title') ?? rowVal(row, 'id');
  const text = searchText(title).trim();
  return text || 'Untitled row';
}

export function truncateText(text: string, max = 96): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

export function includesNeedle(value: unknown, needle: string): boolean {
  return searchText(value).toLowerCase().includes(needle);
}

export type GlobalSearchInput = {
  needle: string;
  allLeafColumns: Column[];
  visibleLeafColumns: Column[];
  hiddenColumnIds: Set<string>;
  treeRows: TreeRow[];
  loadedRows: DataRow[];
  /** Server-side matches across all pages (rows already loaded are skipped). */
  serverRows: DataRow[];
  cellSearchValue: (row: DataRow, col: Column) => unknown;
};

function columnResults({ needle, allLeafColumns, hiddenColumnIds }: GlobalSearchInput): GlobalSearchResult[] {
  return allLeafColumns
    .filter((col) => `${col.label} ${col.id}`.toLowerCase().includes(needle))
    .slice(0, MAX_COLUMN_RESULTS)
    .map((col) => ({
      id: `column:${col.id}`,
      kind: 'column' as const,
      columnId: col.id,
      title: col.label,
      detail: hiddenColumnIds.has(col.id) ? 'Column hidden' : 'Column',
      hidden: hiddenColumnIds.has(col.id),
    }));
}

function firstMatch(row: DataRow, columns: Column[], input: GlobalSearchInput): { col: Column; value: unknown } | null {
  for (const col of columns) {
    const value = input.cellSearchValue(row, col);
    if (includesNeedle(value, input.needle)) return { col, value };
  }
  return null;
}

function matchDetail(match: { col: Column; value: unknown }): string {
  return `${match.col.label}: ${truncateText(searchText(match.value))}`;
}

function displayedRowResults(input: GlobalSearchInput): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = [];
  input.treeRows.forEach(({ row, rowId }, rowIndex) => {
    if (!rowId || results.length >= MAX_ROW_RESULTS) return;
    const match = firstMatch(row, input.visibleLeafColumns, input);
    if (!match) return;
    results.push({
      id: `displayed:${rowId}:${match.col.id}`,
      kind: 'displayed-row',
      rowIndex,
      rowId,
      columnId: match.col.id,
      title: rowTitle(row),
      detail: matchDetail(match),
    });
  });
  return results;
}

function allRowResults(input: GlobalSearchInput): GlobalSearchResult[] {
  const loadedRowIds = new Set(input.loadedRows.map((row) => String(row['id'] ?? '')).filter(Boolean));
  const results: GlobalSearchResult[] = [];
  for (const row of input.serverRows) {
    const rowId = String(row['id'] ?? '');
    if (!rowId || loadedRowIds.has(rowId)) continue;
    const match = firstMatch(row, input.allLeafColumns, input);
    results.push({
      id: `all:${rowId}:${match?.col.id ?? ''}`,
      kind: 'all-row',
      rowId,
      columnId: match?.col.id ?? null,
      title: rowTitle(row),
      detail: match ? matchDetail(match) : 'All rows',
    });
    if (results.length >= MAX_ROW_RESULTS) break;
  }
  return results;
}

export function buildGlobalSearchResults(input: GlobalSearchInput): GlobalSearchResult[] {
  if (input.needle.length === 0) return [];
  return [...columnResults(input), ...displayedRowResults(input), ...allRowResults(input)];
}
