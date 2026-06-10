'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Job, JobActions } from '../hooks/useJobs';
import { jobProgressText } from '../hooks/useJobs';

// ── Compact toolbar chip ──────────────────────────────────────────────────────

interface IndicatorProps {
  jobs: Job[];
  actions: JobActions;
}

export default function JobsIndicator({ jobs, actions }: IndicatorProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  if (jobs.length === 0) return null;

  const running = jobs.filter((j) => j.status === 'running');
  const hasErrors = jobs.some((j) => j.status === 'error');

  // Show the most-recently-started running job's progress, else a summary.
  const featured = running[running.length - 1] ?? jobs[jobs.length - 1];
  const progressText = jobProgressText(featured);

  return (
    <>
      <button
        type="button"
        className={[
          'jobs-indicator-chip',
          running.length > 0 ? 'jobs-indicator-running' : '',
          hasErrors ? 'jobs-indicator-error' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setPanelOpen(true)}
        title="Click to see background jobs"
      >
        {running.length > 0 && <span className="jobs-indicator-spinner" />}
        <span className="jobs-indicator-label">
          {running.length > 0
            ? featured.errorCount > 0
              ? `${featured.label}: ${progressText} · ${featured.errorCount} error${featured.errorCount !== 1 ? 's' : ''}`
              : `${featured.label}: ${progressText}`
            : hasErrors
            ? `${jobs.length} job${jobs.length !== 1 ? 's' : ''} (${jobs.filter((j) => j.status === 'error').length} error${jobs.filter((j) => j.status === 'error').length !== 1 ? 's' : ''})`
            : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} done`}
        </span>
        {jobs.length > 1 && (
          <span className="jobs-indicator-count">{jobs.length}</span>
        )}
      </button>

      {panelOpen && createPortal(
        <JobsPanel jobs={jobs} actions={actions} onClose={() => setPanelOpen(false)} />,
        document.body,
      )}
    </>
  );
}

// ── Details panel ─────────────────────────────────────────────────────────────

function JobsPanel({ jobs, actions, onClose }: { jobs: Job[]; actions: JobActions; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasDone = jobs.some((j) => j.status !== 'running');

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="jobs-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jobs-panel-header">
          <h2 className="dialog-title">Background Jobs</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {hasDone && (
              <button
                type="button"
                className="dialog-btn-secondary"
                style={{ padding: '2px 10px', fontSize: '0.78rem' }}
                onClick={() => actions.dismissDone()}
              >
                Clear done
              </button>
            )}
            <button type="button" className="ai-fill-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <ul className="jobs-panel-list">
          {jobs.length === 0 && (
            <li className="jobs-panel-empty">No jobs</li>
          )}
          {[...jobs].reverse().map((job) => (
            <JobRow key={job.id} job={job} onDismiss={() => actions.dismissJob(job.id)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Single job row ────────────────────────────────────────────────────────────

function JobRow({ job, onDismiss }: { job: Job; onDismiss: () => void }) {
  const [errExpanded, setErrExpanded] = useState(false);
  const [rowLogExpanded, setRowLogExpanded] = useState(false);

  const pct = job.total > 0 ? Math.round((job.completed / job.total) * 100) : null;
  const elapsed = job.finishedAt
    ? ((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(1) + 's'
    : null;

  return (
    <li className={`jobs-panel-row jobs-panel-row--${job.status}`}>
      <div className="jobs-panel-row-top">
        <span className="jobs-panel-status-icon">
          {job.status === 'running' && <span className="jobs-indicator-spinner" />}
          {job.status === 'completed' && '✓'}
          {job.status === 'error' && '✗'}
        </span>

        <div className="jobs-panel-row-body">
          <div className="jobs-panel-row-label">
            {job.label}
            {elapsed && (
              <span className="jobs-panel-elapsed">{elapsed}</span>
            )}
            {job.status !== 'running' && (
              <button
                type="button"
                className="jobs-panel-dismiss"
                onClick={onDismiss}
                title="Dismiss"
              >
                ✕
              </button>
            )}
          </div>

          {/* Progress bar */}
          {(job.status === 'running' || job.total > 0) && (
            <div className="jobs-panel-progress-row">
              <div className="jobs-panel-progress-bar">
                <div
                  className="jobs-panel-progress-fill"
                  style={{ width: pct !== null ? `${pct}%` : '100%', opacity: pct === null ? 0.4 : 1 }}
                />
              </div>
              <span className="jobs-panel-progress-text">
                {jobProgressText(job)}
              </span>
            </div>
          )}

          {/* Detail text */}
          {job.detail && job.status !== 'running' && (
            <p className="jobs-panel-detail">{job.detail}</p>
          )}

          {/* Row log (processed + errored rows) */}
          {job.rowLog.length > 0 && (
            <div className="jobs-panel-row-log">
              <button
                type="button"
                className="jobs-panel-row-log-toggle"
                onClick={() => setRowLogExpanded((v) => !v)}
              >
                {rowLogExpanded ? '▾' : '▸'}{' '}
                {job.rowLog.filter((r) => r.status === 'error').length > 0
                  ? `${job.rowLog.filter((r) => r.status === 'done').length} done · ${job.rowLog.filter((r) => r.status === 'error').length} error${job.rowLog.filter((r) => r.status === 'error').length !== 1 ? 's' : ''}`
                  : `${job.rowLog.length} row${job.rowLog.length !== 1 ? 's' : ''} done`}
              </button>
              {rowLogExpanded && (
                <div className="jobs-panel-row-log-list">
                  {job.rowLog.slice(-100).map((r) => (
                    <div key={r.id} className={`jobs-panel-row-log-entry jobs-panel-row-log-entry--${r.status}`}>
                      <span className="jobs-panel-row-log-icon">{r.status === 'error' ? '✗' : '✓'}</span>
                      <span className="jobs-panel-row-log-name">{r.name || r.id}</span>
                    </div>
                  ))}
                  {job.rowLog.length > 100 && (
                    <div className="jobs-panel-row-log-overflow">+{job.rowLog.length - 100} more</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Errors */}
          {job.errors.length > 0 && (
            <div className="jobs-panel-errors">
              <button
                type="button"
                className="jobs-panel-errors-toggle"
                onClick={() => setErrExpanded((v) => !v)}
              >
                {errExpanded ? '▾' : '▸'} {job.errors.length} error{job.errors.length !== 1 ? 's' : ''}
              </button>
              {errExpanded && (
                <ul className="ai-fill-errors-list">
                  {job.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
