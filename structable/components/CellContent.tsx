'use client';

import type { DataRow } from '../types/table';
import { rowVal } from './TreeTable';

const PINNED_COL = 'name';

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(String(value))) {
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

type Props = {
  row: DataRow;
  colId: string;
  sourcePath?: string[] | null;
  compiledExpr?: (row: DataRow) => unknown;
  hasNote?: boolean;
  hasComment?: boolean;
};

export default function CellContent({ row, colId, sourcePath, compiledExpr, hasNote, hasComment }: Props) {
  let content: React.ReactNode;

  if (colId === PINNED_COL) {
    content = (
      <a
        href={`https://github.com/${String(rowVal(row, colId, sourcePath))}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {String(rowVal(row, colId, sourcePath) ?? '-')}
      </a>
    );
  } else if (compiledExpr) {
    try {
      const v = compiledExpr(row);
      content = v != null ? String(v) : '-';
    } catch {
      content = '#ERR';
    }
  } else {
    content = formatCell(rowVal(row, colId, sourcePath));
  }

  return (
    <>
      {content}
      {(hasNote || hasComment) && (
        <span
          className="cell-dot"
          title={[hasNote && 'Note', hasComment && 'Comment'].filter(Boolean).join(' · ')}
        />
      )}
    </>
  );
}
