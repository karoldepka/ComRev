import type { DataRow } from '../types/table';

export function readPath(row: DataRow, path: string[]): unknown {
  let value: unknown = row;
  for (const part of path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function rowVal(row: DataRow, id: string, sourcePath?: string[] | null): unknown {
  if (sourcePath?.length) return readPath(row, sourcePath);
  if (Object.prototype.hasOwnProperty.call(row, id)) return row[id];
  return undefined;
}
