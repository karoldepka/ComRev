export type FlagColorId = 'blue' | 'green' | 'yellow' | 'orange' | 'red';

export const FLAG_COLORS: readonly { id: FlagColorId; label: string; bg: string }[] = [
  { id: 'blue',   label: 'Uncertain',   bg: '#2563eb' },
  { id: 'green',  label: 'Good',        bg: '#16a34a' },
  { id: 'yellow', label: 'Warning',     bg: '#d97706' },
  { id: 'orange', label: 'Investigate', bg: '#ea580c' },
  { id: 'red',    label: 'Bad',         bg: '#dc2626' },
] as const;

export type CellTarget = { rowId: string; colId: string };

export type ToastMessage = {
  id: string;
  message: string;
  level: 'error' | 'warn' | 'info';
};

// ── API response shapes ────────────────────────────────────────────────────────
// All PKs are client-generated nanoid strings so records can be created offline.

export type RemarkTarget = {
  row_id: string;   // '' = column-header remark
  column_id: string;
};

/** Unified note or comment. kind='note' has no resolve button; kind='comment' does. */
export type ApiRemark = {
  id: string;
  body: string;
  kind: 'note' | 'comment';
  is_private: boolean;
  resolved_at: string | null;
  targets: RemarkTarget[];
};

export type ApiFlag = {
  id: string;
  key: string;
  color: string;
};

export type ApiTable = {
  id: string;
  title: string;
  description: string | null;
};

export type ApiCustomColumn = {
  id: string;
  name: string;
  label: string | null;
  description: string | null;
  expression: string | null;
  position_after: string | null;
  read_only?: boolean;
  readOnly?: boolean;
  types?: string[];
  data_types?: string[];
  source_path?: string[] | null;
  is_group?: boolean;
  parent_ids?: string[];
  /** Backward compatibility for older API responses. Prefer read_only. */
  is_editable?: boolean;
};

export type ApiHiddenRow = {
  id: string;
  row_id: string;
};

export type ApiHiddenColumn = {
  id: string;
  column_id: string;
};

export type DataRow = Record<string, unknown>;

export type PagedResponse = {
  data: DataRow[];
  total: number;
  page: number;
  per_page: number;
};
