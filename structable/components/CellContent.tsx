'use client';

import type { DataRow } from '../types/table';
import { formatCell } from '../utils/formatting';
import { rowVal } from '../utils/rowVal';
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
  /** Reference columns: label of the referenced row (null = empty cell). Undefined for other columns. */
  referenceLabel?: string | null;
};

function BooleanCell({ value }: { value: boolean }) {
  return (
    <span className="table-checkbox-cell" title={value ? 'Checked' : 'Unchecked'}>
      <input
        type="checkbox"
        checked={value}
        readOnly
        tabIndex={-1}
        aria-label={value ? 'Checked' : 'Unchecked'}
      />
    </span>
  );
}

function renderCellValue(value: unknown, formatNumericStrings?: boolean): React.ReactNode {
  if (typeof value === 'boolean') return <BooleanCell value={value} />;
  return formatCell(value, { formatNumericStrings });
}

export default function CellContent({ row, colId, sourcePath, types, formatNumericStrings, compiledExpr, hasNote, hasComment, referenceLabel }: Props) {
  let content: React.ReactNode;

  if (referenceLabel !== undefined) {
    content = referenceLabel === null ? '-' : <span className="reference-chip">{referenceLabel}</span>;
  } else if (isRatingColumnType(types)) {
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
      content = renderCellValue(v, formatNumericStrings);
    } catch {
      content = '#ERR';
    }
  } else {
    content = renderCellValue(rowVal(row, colId, sourcePath), formatNumericStrings);
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
