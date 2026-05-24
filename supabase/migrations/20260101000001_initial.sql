-- CompaReview initial schema
-- Apply via: Supabase SQL editor or `supabase db push`

-- ─────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comparison_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  is_public   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id      uuid NOT NULL REFERENCES comparison_sets ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  url         text,
  github_url  text,
  position    integer NOT NULL DEFAULT 0,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS columns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id       uuid NOT NULL REFERENCES comparison_sets ON DELETE CASCADE,
  parent_id    uuid REFERENCES columns ON DELETE CASCADE,
  name         text NOT NULL,
  display_name text,
  col_type     text NOT NULL DEFAULT 'text'
               CHECK (col_type IN ('boolean', 'text', 'number', 'url', 'mixed')),
  position     integer NOT NULL DEFAULT 0,
  description  text,
  is_archived  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cells (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id         uuid NOT NULL REFERENCES rows ON DELETE CASCADE,
  column_id      uuid NOT NULL REFERENCES columns ON DELETE CASCADE,
  value          jsonb,
  filled_by_ai   boolean NOT NULL DEFAULT false,
  source_url     text,
  source_excerpt text,
  confidence     float CHECK (confidence BETWEEN 0 AND 1),
  updated_by     uuid REFERENCES auth.users ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (row_id, column_id)
);

-- Per-user hidden columns (presence = hidden)
CREATE TABLE IF NOT EXISTS column_visibility (
  user_id   uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES columns ON DELETE CASCADE,
  PRIMARY KEY (user_id, column_id)
);

CREATE TABLE IF NOT EXISTS cell_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id    uuid NOT NULL REFERENCES cells ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  content    text NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_fill_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id          uuid NOT NULL REFERENCES comparison_sets ON DELETE CASCADE,
  cell_ids        uuid[] NOT NULL,
  llm_provider    text NOT NULL
                  CHECK (llm_provider IN ('claude', 'openai', 'gemini')),
  llm_model       text,
  search_provider text NOT NULL DEFAULT 'tavily'
                  CHECK (search_provider IN ('tavily', 'brave', 'none')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  results         jsonb,
  error           text,
  created_by      uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rows_set_position       ON rows (set_id, position);
CREATE INDEX IF NOT EXISTS idx_columns_set_parent_pos  ON columns (set_id, parent_id, position);
CREATE INDEX IF NOT EXISTS idx_cells_column            ON cells (column_id);
CREATE INDEX IF NOT EXISTS idx_cells_row               ON cells (row_id);
CREATE INDEX IF NOT EXISTS idx_cell_comments_cell_date ON cell_comments (cell_id, created_at);
CREATE INDEX IF NOT EXISTS idx_col_visibility_user     ON column_visibility (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_set             ON ai_fill_jobs (set_id, status);

-- ─────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comparison_sets_updated_at
  BEFORE UPDATE ON comparison_sets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cells_updated_at
  BEFORE UPDATE ON cells
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cell_comments_updated_at
  BEFORE UPDATE ON cell_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────

ALTER TABLE comparison_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rows               ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cells              ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_visibility  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_fill_jobs       ENABLE ROW LEVEL SECURITY;

-- comparison_sets: public read; write = owner
CREATE POLICY "cs_public_read"  ON comparison_sets FOR SELECT
  USING (is_public = true OR auth.uid() = created_by);
CREATE POLICY "cs_owner_insert" ON comparison_sets FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "cs_owner_update" ON comparison_sets FOR UPDATE
  USING (auth.uid() = created_by);
CREATE POLICY "cs_owner_delete" ON comparison_sets FOR DELETE
  USING (auth.uid() = created_by);

-- rows: readable if parent set is readable
CREATE POLICY "rows_read" ON rows FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM comparison_sets cs
    WHERE cs.id = rows.set_id
      AND (cs.is_public = true OR cs.created_by = auth.uid())
  ));
CREATE POLICY "rows_write" ON rows FOR ALL
  USING (EXISTS (
    SELECT 1 FROM comparison_sets cs
    WHERE cs.id = rows.set_id AND cs.created_by = auth.uid()
  ));

-- columns: same as rows
CREATE POLICY "cols_read" ON columns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM comparison_sets cs
    WHERE cs.id = columns.set_id
      AND (cs.is_public = true OR cs.created_by = auth.uid())
  ));
CREATE POLICY "cols_write" ON columns FOR ALL
  USING (EXISTS (
    SELECT 1 FROM comparison_sets cs
    WHERE cs.id = columns.set_id AND cs.created_by = auth.uid()
  ));

-- cells: readable on public sets; writable by authenticated users
CREATE POLICY "cells_read" ON cells FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM rows r
    JOIN comparison_sets cs ON cs.id = r.set_id
    WHERE r.id = cells.row_id
      AND (cs.is_public = true OR cs.created_by = auth.uid())
  ));
CREATE POLICY "cells_write" ON cells FOR ALL
  USING (auth.uid() IS NOT NULL);

-- column_visibility: users manage their own
CREATE POLICY "cv_own" ON column_visibility FOR ALL
  USING (auth.uid() = user_id);

-- cell_comments: public read; auth write
CREATE POLICY "comments_read"   ON cell_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON cell_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_update" ON cell_comments FOR UPDATE
  USING (auth.uid() = user_id);

-- ai_fill_jobs: owner access
CREATE POLICY "aijobs_own" ON ai_fill_jobs FOR ALL
  USING (auth.uid() = created_by);

-- ─────────────────────────────────────────────
-- Enable Realtime for cell_comments
-- ─────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE cell_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE cells;
