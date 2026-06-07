'use client';

import type { DataRow } from '../types/table';
import { formatCell } from '../utils/formatting';
import { rowVal } from './TreeTable';
import RatingStars, { isRatingColumnType } from './RatingStars';

const PINNED_COL = 'name';

type Props = {
  row: DataRow;
  colId: string;
  sourcePath?: string[] | null;
  types?: string[];
  formatNumericStrings?: boolean;
  compiledExpr?: (row: DataRow) => unknown;
  hasNote?: boolean;
  hasComment?: boolean;
};

export default function CellContent({ row, colId, sourcePath, types, formatNumericStrings, compiledExpr, hasNote, hasComment }: Props) {
  let content: React.ReactNode;

  if (isRatingColumnType(types)) {
    try {
      const value = compiledExpr ? compiledExpr(row) : rowVal(row, colId, sourcePath);
      content = <RatingStars value={value} readOnly />;
    } catch {
      content = '#ERR';
    }
  } else if (colId === PINNED_COL) {
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
      content = formatCell(v, { formatNumericStrings });
    } catch {
      content = '#ERR';
    }
  } else {
    content = formatCell(rowVal(row, colId, sourcePath), { formatNumericStrings });
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
