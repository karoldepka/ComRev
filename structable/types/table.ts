export type FlagColorId = 'blue' | 'green' | 'yellow' | 'orange' | 'red';

export const FLAG_COLORS: readonly { id: FlagColorId; label: string; bg: string }[] = [
  { id: 'blue',   label: 'Uncertain',   bg: '#2563eb' },
  { id: 'green',  label: 'Good',        bg: '#16a34a' },
  { id: 'yellow', label: 'Warning',     bg: '#d97706' },
  { id: 'orange', label: 'Investigate', bg: '#ea580c' },
  { id: 'red',    label: 'Bad',         bg: '#dc2626' },
] as const;

export type CellTarget = { repoId: number; colId: string };

export type ToastMessage = {
  id: string;
  message: string;
  level: 'error' | 'warn' | 'info';
};

// API response shapes
export type ApiComment = {
  id: number;
  repo_id: number;
  column_id: string;
  body: string;
};

export type ApiFlag = {
  id: number;
  key: string;
  color: string;
};

export type ApiCustomColumn = {
  id: number;
  name: string;
  label: string | null;
  expression: string | null;
  position_after: string | null;
};

export type ApiHiddenRow = {
  id: number;
  repo_id: number;
};

export type ApiHiddenColumn = {
  id: number;
  column_id: string;
};

export type RepoRow = Record<string, unknown>;

export type PagedResponse = {
  data: RepoRow[];
  total: number;
  page: number;
  per_page: number;
};
