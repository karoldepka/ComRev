'use client';

import type { RepoRow } from '../types/table';

const PINNED_COL = 'name';

export function formatCell(value: unknown, columnId: string): string {
  if (value === null || value === undefined) return '-';
  if (columnId.endsWith('_at')) {
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

type Props = {
  row: RepoRow;
  colId: string;
  compiledExpr?: (row: RepoRow) => unknown;
  hasNote?: boolean;
  hasComment?: boolean;
};

export default function CellContent({ row, colId, compiledExpr, hasNote, hasComment }: Props) {
  let content: React.ReactNode;

  if (colId === PINNED_COL) {
    content = (
      <a
        href={`https://github.com/${String(row[colId])}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {String(row[colId] ?? '-')}
      </a>
    );
  } else if (colId.startsWith('custom:')) {
    if (compiledExpr) {
      try {
        const v = compiledExpr(row);
        content = v != null ? String(v) : '-';
      } catch {
        content = '#ERR';
      }
    } else {
      // Non-expression custom column: show stored value (may be set by user edits)
      content = formatCell(row[colId], colId);
    }
  } else {
    content = formatCell(row[colId], colId);
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
