-- Rename repo_id → row_id throughout, and change type BIGINT → TEXT.
-- Rationale: Structable is a generic table; rows are identified by their TEXT pk,
-- not a GitHub-specific integer.
-- Sentinel for column-header remark targets: was 0 (BIGINT), is now '' (empty TEXT).

-- ── remark_targets ────────────────────────────────────────────────────────────

ALTER TABLE remark_targets DROP CONSTRAINT remark_targets_pkey;
DROP INDEX IF EXISTS idx_remark_targets_cell;

ALTER TABLE remark_targets RENAME COLUMN repo_id TO row_id;
ALTER TABLE remark_targets ALTER COLUMN row_id TYPE TEXT USING row_id::text;
ALTER TABLE remark_targets ALTER COLUMN row_id SET DEFAULT '';

-- Remap header-target sentinel: bigint 0 → empty string
UPDATE remark_targets SET row_id = '' WHERE row_id = '0';

ALTER TABLE remark_targets ADD PRIMARY KEY (remark_id, row_id, column_id);
CREATE INDEX idx_remark_targets_cell ON remark_targets (row_id, column_id);

-- ── hidden_rows ───────────────────────────────────────────────────────────────

ALTER TABLE hidden_rows DROP CONSTRAINT IF EXISTS hidden_rows_repo_id_key;
ALTER TABLE hidden_rows RENAME COLUMN repo_id TO row_id;
ALTER TABLE hidden_rows ALTER COLUMN row_id TYPE TEXT USING row_id::text;
ALTER TABLE hidden_rows ADD CONSTRAINT hidden_rows_row_id_key UNIQUE (row_id);
