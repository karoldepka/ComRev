-- ComRev operational schema — aligned with the project constitution:
--   • TEXT PKs (client-generated nanoid, not server SERIAL/UUID)
--   • Unified "remarks" (notes + comments) instead of separate cell_comments
--   • remark_targets join table: one remark can attach to multiple cells
--   • operations_log for distributed sync (no seq numbers — fully P2P)
--
-- Supabase set_updated_at() trigger function is defined in migration 001.
-- Apply with: supabase db push

-- ── Tear down old template tables ────────────────────────────────────────────

DROP TABLE IF EXISTS cell_comments   CASCADE;
DROP TABLE IF EXISTS custom_columns  CASCADE;
DROP TABLE IF EXISTS cell_flags      CASCADE;
DROP TABLE IF EXISTS hidden_rows     CASCADE;
DROP TABLE IF EXISTS hidden_columns  CASCADE;
DROP TABLE IF EXISTS remarks         CASCADE;
DROP TABLE IF EXISTS remark_targets  CASCADE;
DROP TABLE IF EXISTS operations_log  CASCADE;

-- ── remarks ───────────────────────────────────────────────────────────────────
-- Unified notes + comments.  kind ∈ {'note','comment'}.
-- resolved_at is set when a comment is resolved (notes never resolved).

CREATE TABLE remarks (
  id          TEXT        PRIMARY KEY,
  body        TEXT        NOT NULL    DEFAULT '',
  kind        TEXT        NOT NULL    DEFAULT 'note'
              CHECK (kind IN ('note', 'comment')),
  is_private  BOOLEAN     NOT NULL    DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL    DEFAULT NOW()
);

CREATE TRIGGER trg_remarks_updated_at
  BEFORE UPDATE ON remarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE remarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "remarks_public_read" ON remarks FOR SELECT USING (true);

-- ── remark_targets ────────────────────────────────────────────────────────────
-- One remark can be attached to multiple cells.
-- repo_id = 0 means a column-header target.

CREATE TABLE remark_targets (
  remark_id   TEXT    NOT NULL REFERENCES remarks(id) ON DELETE CASCADE,
  repo_id     BIGINT  NOT NULL DEFAULT 0,
  column_id   TEXT    NOT NULL,
  PRIMARY KEY (remark_id, repo_id, column_id)
);

CREATE INDEX idx_remark_targets_cell ON remark_targets (repo_id, column_id);

ALTER TABLE remark_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "remark_targets_public_read" ON remark_targets FOR SELECT USING (true);

-- ── custom_columns ────────────────────────────────────────────────────────────

CREATE TABLE custom_columns (
  id             TEXT        PRIMARY KEY,
  name           TEXT        NOT NULL,
  label          TEXT,
  expression     TEXT,
  position_after TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE custom_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_cols_public_read" ON custom_columns FOR SELECT USING (true);

-- ── cell_flags ────────────────────────────────────────────────────────────────

CREATE TABLE cell_flags (
  id         TEXT        PRIMARY KEY,
  key        TEXT        NOT NULL UNIQUE,
  color      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cell_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flags_public_read" ON cell_flags FOR SELECT USING (true);

-- ── hidden_rows ───────────────────────────────────────────────────────────────

CREATE TABLE hidden_rows (
  id         TEXT        PRIMARY KEY,
  repo_id    BIGINT      NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hidden_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hidden_rows_public_read" ON hidden_rows FOR SELECT USING (true);

-- ── hidden_columns ────────────────────────────────────────────────────────────

CREATE TABLE hidden_columns (
  id         TEXT        PRIMARY KEY,
  column_id  TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hidden_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hidden_cols_public_read" ON hidden_columns FOR SELECT USING (true);

-- ── operations_log ────────────────────────────────────────────────────────────
-- Append-only. No seq numbers — distributed, fault-tolerant (nanoid PKs).
-- Foundation for eventual P2P sync.

CREATE TABLE operations_log (
  id         TEXT        PRIMARY KEY,
  op         TEXT        NOT NULL,
  payload    JSONB       NOT NULL,
  client_id  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ops_log_created ON operations_log (created_at DESC);
CREATE INDEX idx_ops_log_op      ON operations_log (op);

ALTER TABLE operations_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_log_public_read" ON operations_log FOR SELECT USING (true);
