import { rowVal } from '../../utils/rowVal';
import type { DataRow } from '../../types/table';
import { FULL_NAME_COL_ID } from './columns';

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
