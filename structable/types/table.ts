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
  tagline: string | null;
  description: string | null;
};

export type ApiCustomColumn = {
  id: string;
  title: string | null;
  description: string | null;
  expression: string | null;
  position_before: string | null;
  position_after: string | null;
  read_only?: boolean;
  readOnly?: boolean;
  types?: string[];
  data_types?: string[];
  source_path?: string[] | null;
  is_group?: boolean;
  is_frozen?: boolean;
  parent_ids?: string[];
  /** Backward compatibility for older API responses. Prefer read_only. */
  is_editable?: boolean;
};

export type ApiHiddenRow = {
  id: string;
  row_id: string;
};

export type RowClass = {
  id: string;
  table_id: string;
  name: string;
  color: string | null;
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
  /** Non-empty when stores have conflicting data or a fan-out write partially failed. */
  errors?: string[];
};
