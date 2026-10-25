'use client';

import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import JobsIndicator from '../JobsIndicator';
import type { useJobs } from '../../hooks/useJobs';
import type { Column } from './columns';

const PER_PAGE_OPTIONS = [25, 50, 100, 250, 500, 1000];

type Jobs = ReturnType<typeof useJobs>;

type Props = {
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
  hiddenRowCount: number;
  hiddenColumnIds: string[];
  allLeafColumns: Column[];
  showRowNumbers: boolean;
  onShowRowNumbers: () => void;
  onShowColumn: (id: string) => void;
  onShowAll: () => void;
  onAiFill: () => void;
  onAiFillClasses: () => void;
  jobs: Jobs['jobs'];
  jobActions: Jobs['actions'];
};

export default function TableFooter(props: Props) {
  const { total, page, totalPages, onPageChange, perPage, onPerPageChange, hiddenRowCount } = props;
  return (
    <div className="table-note">
      <span>{total.toLocaleString()} rows — page {page} of {totalPages}</span>
      <button type="button" className="ai-fill-trigger-button" onClick={props.onAiFill} title="Fill columns using AI">
        ✦ AI Fill
      </button>
      <button type="button" className="ai-fill-trigger-button" onClick={props.onAiFillClasses} title="Auto-assign Classes using local Ollama">
        ✦ AI Fill Classes
      </button>
      <JobsIndicator jobs={props.jobs} actions={props.jobActions} />
      <span className="ml-4">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>← Prev</button>
        {' '}
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Next →</button>
      </span>
      <label className="ml-4 inline-flex items-center gap-1.5 text-[0.82rem] text-app-muted">
        Rows per page:
        <select
          value={perPage}
          onChange={(e) => onPerPageChange(Number(e.target.value))}
          className="cursor-pointer rounded border border-app-border bg-app-surface px-1 py-px text-[0.82rem] text-app-fg"
        >
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {hiddenRowCount > 0 && (
        <span className="ml-4 text-[0.81rem] text-app-muted">
          {hiddenRowCount} row{hiddenRowCount !== 1 ? 's' : ''} hidden
        </span>
      )}
      <HiddenColumnsControls {...props} />
    </div>
  );
}

/** One "N hidden" button; the chips to re-show columns live in a popover so they never eat table height. */
function HiddenColumnsControls({ hiddenColumnIds, allLeafColumns, showRowNumbers, onShowRowNumbers, onShowColumn, onShowAll }: Props) {
  // Hidden-column prefs are not per table; only offer columns that exist in this one.
  const hiddenColumns = allLeafColumns.filter((col) => hiddenColumnIds.includes(col.id));
  const hiddenCount = hiddenColumns.length + (showRowNumbers ? 0 : 1);
  if (hiddenCount === 0) return null;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="show-column-button">
          {hiddenCount} hidden column{hiddenCount !== 1 ? 's' : ''} ▾
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={6} collisionPadding={16} className="hidden-columns-popover">
          {!showRowNumbers && (
            <button type="button" className="show-column-button" onClick={onShowRowNumbers}>#</button>
          )}
          {hiddenColumns.map((col) => (
            <button key={col.id} type="button" className="show-column-button" onClick={() => onShowColumn(col.id)}>
              {col.label}
            </button>
          ))}
          <button type="button" className="show-all-button" onClick={onShowAll}>Show all</button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
