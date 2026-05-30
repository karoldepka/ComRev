-- Scope generic rows by Structable table and attach reusable column objects to tables.
-- Existing GitHub comparison data remains attached to the seeded gh_repos table.

CREATE TABLE IF NOT EXISTS table_custom_columns (
  table_id            TEXT        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  column_id           TEXT        NOT NULL REFERENCES custom_columns(id) ON DELETE CASCADE,
  position_after      TEXT,
  is_frozen           BOOLEAN     NOT NULL DEFAULT false,
  who_created         TEXT,
  when_created        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  who_last_modified   TEXT,
  when_last_modified  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modify_count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (table_id, column_id)
);

CREATE TRIGGER trg_table_custom_columns_when_last_modified
  BEFORE UPDATE ON table_custom_columns
  FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();

INSERT INTO table_custom_columns (table_id, column_id, position_after, is_frozen)
SELECT 'gh_repos', id, position_after, name = 'name'
FROM custom_columns
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_table_custom_columns_column_id
  ON table_custom_columns (column_id);

ALTER TABLE table_custom_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_custom_columns_public_read" ON table_custom_columns FOR SELECT USING (true);
CREATE POLICY "table_custom_columns_auth_write" ON table_custom_columns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS table_rows (
  id                  TEXT        PRIMARY KEY,
  table_id            TEXT        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  who_created         TEXT,
  when_created        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  who_last_modified   TEXT,
  when_last_modified  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  custom_values       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  modify_count        INTEGER     NOT NULL DEFAULT 0
);

CREATE TRIGGER trg_table_rows_when_last_modified
  BEFORE UPDATE ON table_rows
  FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();

CREATE INDEX IF NOT EXISTS idx_table_rows_table_id
  ON table_rows (table_id, when_created DESC);

CREATE INDEX IF NOT EXISTS idx_table_rows_custom_values_gin
  ON table_rows USING gin (custom_values);

ALTER TABLE table_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_rows_public_read" ON table_rows FOR SELECT USING (true);
CREATE POLICY "table_rows_auth_write" ON table_rows
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
