import { useCallback, useState } from 'react';
import { nanoid } from 'nanoid';

export type JobStatus = 'running' | 'completed' | 'error';

export type RowLogEntry = {
  id: string;
  name: string;
  status: 'done' | 'error';
};

export type Job = {
  id: string;
  label: string;
  status: JobStatus;
  /** Rows / items completed so far. */
  completed: number;
  /** Total rows / items. 0 means unknown (indeterminate). */
  total: number;
  /** Last human-readable status message. */
  detail: string;
  /** Error count tracked live during running; full messages arrive on finish. */
  errorCount: number;
  errors: string[];
  /** Per-row progress log (processed and errored rows only, not skipped). */
  rowLog: RowLogEntry[];
  startedAt: Date;
  finishedAt?: Date;
};

export type JobActions = {
  /** Register a new running job and return its id. */
  startJob(label: string, total?: number): string;
  /** Update progress of an in-flight job. Optionally append a row entry to the log. */
  updateJob(id: string, patch: { completed?: number; total?: number; detail?: string; errorCount?: number; appendToRowLog?: RowLogEntry }): void;
  /** Mark a job as completed (or error if errors non-empty). */
  finishJob(id: string, detail?: string, errors?: string[]): void;
  /** Mark a job as failed with a single error string. */
  failJob(id: string, error: string): void;
  /** Remove a single job from the list. */
  dismissJob(id: string): void;
  /** Remove all completed / errored jobs. */
  dismissDone(): void;
};

export function useJobs(): { jobs: Job[]; actions: JobActions } {
  const [jobs, setJobs] = useState<Job[]>([]);

  const patchJob = useCallback((id: string, update: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...update } : j)));
  }, []);

  const actions: JobActions = {
    startJob(label, total = 0) {
      const id = nanoid(8);
      const job: Job = {
        id,
        label,
        status: 'running',
        completed: 0,
        total,
        detail: '',
        errorCount: 0,
        errors: [],
        rowLog: [],
        startedAt: new Date(),
      };
      setJobs((prev) => [...prev, job]);
      return id;
    },

    updateJob(id, { appendToRowLog, errorCount, ...rest }) {
      setJobs((prev) => prev.map((j) => {
        if (j.id !== id) return j;
        const updated: Job = { ...j, ...rest };
        if (errorCount !== undefined) updated.errorCount = errorCount;
        if (appendToRowLog) updated.rowLog = [...j.rowLog, appendToRowLog];
        return updated;
      }));
    },

    finishJob(id, detail = '', errors = []) {
      patchJob(id, {
        status: errors.length > 0 ? 'error' : 'completed',
        detail,
        errors,
        finishedAt: new Date(),
      });
    },

    failJob(id, error) {
      patchJob(id, { status: 'error', errors: [error], finishedAt: new Date() });
    },

    dismissJob(id) {
      setJobs((prev) => prev.filter((j) => j.id !== id));
    },

    dismissDone() {
      setJobs((prev) => prev.filter((j) => j.status === 'running'));
    },
  };

  return { jobs, actions };
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function jobProgressText(job: Job): string {
  if (job.status === 'completed') return job.detail || 'Done';
  if (job.status === 'error') return job.errors[0] ?? 'Error';
  if (job.total > 0) {
    const pct = Math.round((job.completed / job.total) * 100);
    return `${job.completed} of ${job.total} (${pct}%)`;
  }
  return job.detail || 'Running…';
}
