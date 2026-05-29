-- Tables registry: every Structable table has a row here.
-- The tables table itself is displayable in the Structable grid (meta-view).
-- Locked fields (id, who_created, when_created, when_last_modified, who_last_modified)
-- are managed by the server — not writable via the cell editor.

CREATE TABLE tables (
  id                  TEXT        PRIMARY KEY,
  title               TEXT        NOT NULL,
  description         TEXT,
  who_created         TEXT,
  when_created        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  when_last_modified  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  who_last_modified   TEXT
);

CREATE TRIGGER trg_tables_when_last_modified
  BEFORE UPDATE ON tables
  FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables_public_read" ON tables FOR SELECT USING (true);
CREATE POLICY "tables_auth_write" ON tables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed the pre-existing GitHub repositories table.
INSERT INTO tables (id, title, description) VALUES (
  'gh_repos',
  'GitHub Repositories',
  'Comparison table for GitHub repositories, auto-populated from the GitHub API.'
);

-- ── custom_columns: add description, align created_at → when_created ──────────

ALTER TABLE custom_columns
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE custom_columns
  RENAME COLUMN created_at TO when_created;
