// DDL-only schema statements for Postgres.
// Seed data (builtin tables/columns) lives in seed::upload_to_structable.
// DDL-only schema statements for Postgres.
// Seed data (builtin tables/columns) lives in seed::upload_to_structable.

pub const POSTGRES_SCHEMA: &[&str] = &[
    r#"
    CREATE OR REPLACE FUNCTION set_when_last_modified()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.when_last_modified := NOW();
      RETURN NEW;
    END;
    $$;
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS remarks (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'note',
      is_private BOOLEAN NOT NULL DEFAULT false,
      resolved_at TIMESTAMPTZ,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    r#"
    ALTER TABLE remarks
      ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'note',
      ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS who_created TEXT,
      ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS who_last_modified TEXT,
      ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;
    "#,
    r#"
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remarks_kind_check') THEN
        ALTER TABLE remarks ADD CONSTRAINT remarks_kind_check CHECK (kind IN ('note', 'comment'));
      END IF;
    END $$;
    "#,
    "DROP TRIGGER IF EXISTS trg_remarks_when_last_modified ON remarks;",
    "CREATE TRIGGER trg_remarks_when_last_modified BEFORE UPDATE ON remarks FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    r#"
    CREATE TABLE IF NOT EXISTS remark_targets (
      remark_id TEXT NOT NULL REFERENCES remarks(id) ON DELETE CASCADE,
      row_id TEXT NOT NULL DEFAULT '',
      column_id TEXT NOT NULL,
      PRIMARY KEY (remark_id, row_id, column_id)
    );
    "#,
    r#"
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'remark_targets' AND column_name = 'repo_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'remark_targets' AND column_name = 'row_id'
      ) THEN
        ALTER TABLE remark_targets RENAME COLUMN repo_id TO row_id;
      END IF;
    END $$;
    "#,
    "ALTER TABLE remark_targets ALTER COLUMN row_id TYPE TEXT USING row_id::text;",
    "CREATE INDEX IF NOT EXISTS idx_remark_targets_cell ON remark_targets (row_id, column_id);",
    r#"
    CREATE TABLE IF NOT EXISTS custom_columns (
      id TEXT PRIMARY KEY,
      title TEXT,
      label TEXT,
      description TEXT,
      expression TEXT,
      position_after TEXT,
      read_only BOOLEAN NOT NULL DEFAULT false,
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      is_group BOOLEAN NOT NULL DEFAULT false,
      parent_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      source_path TEXT[],
      types TEXT[] NOT NULL DEFAULT ARRAY['text'],
      data_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    "ALTER TABLE custom_columns DROP COLUMN IF EXISTS name;",
    r#"
    ALTER TABLE custom_columns
      ADD COLUMN IF NOT EXISTS title TEXT,
      ADD COLUMN IF NOT EXISTS label TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS expression TEXT,
      ADD COLUMN IF NOT EXISTS position_after TEXT,
      ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS parent_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS source_path TEXT[],
      ADD COLUMN IF NOT EXISTS types TEXT[] NOT NULL DEFAULT ARRAY['text'],
      ADD COLUMN IF NOT EXISTS data_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS who_created TEXT,
      ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS who_last_modified TEXT,
      ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;
    "#,
    r#"
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_columns_types_check') THEN
        ALTER TABLE custom_columns ADD CONSTRAINT custom_columns_types_check
          CHECK (types <@ ARRAY['text','integer','bigint','numeric','boolean','url','array','jsonb','timestamptz']::TEXT[] AND array_length(types, 1) > 0);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_columns_data_types_check') THEN
        ALTER TABLE custom_columns ADD CONSTRAINT custom_columns_data_types_check
          CHECK (data_types <@ ARRAY['numeric','text','categorical','boolean']::TEXT[]);
      END IF;
    END $$;
    "#,
    "DROP TRIGGER IF EXISTS trg_custom_columns_when_last_modified ON custom_columns;",
    "CREATE TRIGGER trg_custom_columns_when_last_modified BEFORE UPDATE ON custom_columns FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    "CREATE INDEX IF NOT EXISTS idx_custom_columns_parent_ids ON custom_columns USING gin(parent_ids);",
    r#"
    CREATE TABLE IF NOT EXISTS cell_flags (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    "ALTER TABLE cell_flags ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS who_last_modified TEXT, ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;",
    "DROP TRIGGER IF EXISTS trg_cell_flags_when_last_modified ON cell_flags;",
    "CREATE TRIGGER trg_cell_flags_when_last_modified BEFORE UPDATE ON cell_flags FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    r#"
    CREATE TABLE IF NOT EXISTS hidden_rows (
      id TEXT PRIMARY KEY,
      row_id TEXT NOT NULL UNIQUE,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    r#"
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'hidden_rows' AND column_name = 'repo_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'hidden_rows' AND column_name = 'row_id'
      ) THEN
        ALTER TABLE hidden_rows RENAME COLUMN repo_id TO row_id;
      END IF;
    END $$;
    "#,
    "ALTER TABLE hidden_rows ALTER COLUMN row_id TYPE TEXT USING row_id::text;",
    "ALTER TABLE hidden_rows ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS who_last_modified TEXT, ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;",
    "DROP TRIGGER IF EXISTS trg_hidden_rows_when_last_modified ON hidden_rows;",
    "CREATE TRIGGER trg_hidden_rows_when_last_modified BEFORE UPDATE ON hidden_rows FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    r#"
    CREATE TABLE IF NOT EXISTS hidden_columns (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL UNIQUE,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    "ALTER TABLE hidden_columns ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS who_last_modified TEXT, ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;",
    "DROP TRIGGER IF EXISTS trg_hidden_columns_when_last_modified ON hidden_columns;",
    "CREATE TRIGGER trg_hidden_columns_when_last_modified BEFORE UPDATE ON hidden_columns FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    r#"
    CREATE TABLE IF NOT EXISTS operations_log (
      seq         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id          TEXT NOT NULL UNIQUE,
      op          TEXT NOT NULL,
      payload     JSONB NOT NULL,
      tx_id       TEXT,
      client_id   TEXT,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_at  TIMESTAMPTZ
    );
    "#,
    "ALTER TABLE operations_log ADD COLUMN IF NOT EXISTS tx_id TEXT, ADD COLUMN IF NOT EXISTS client_id TEXT, ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;",
    "ALTER TABLE operations_log ADD COLUMN IF NOT EXISTS seq BIGINT GENERATED ALWAYS AS IDENTITY;",
    "CREATE INDEX IF NOT EXISTS idx_ops_log_created ON operations_log (when_created DESC);",
    "CREATE INDEX IF NOT EXISTS idx_ops_log_op ON operations_log (op);",
    r#"
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    "ALTER TABLE tables ADD COLUMN IF NOT EXISTS description TEXT, ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS who_last_modified TEXT, ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;",
    "DROP TRIGGER IF EXISTS trg_tables_when_last_modified ON tables;",
    "CREATE TRIGGER trg_tables_when_last_modified BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    r#"
    CREATE TABLE IF NOT EXISTS github_repos (
      id TEXT PRIMARY KEY,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    "CREATE INDEX IF NOT EXISTS idx_gh_cv_gin ON github_repos USING gin (custom_values);",
    "DROP TRIGGER IF EXISTS trg_gh_repos_when_last_modified ON github_repos;",
    "CREATE TRIGGER trg_gh_repos_when_last_modified BEFORE UPDATE ON github_repos FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    r#"
    CREATE TABLE IF NOT EXISTS table_custom_columns (
      table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
      column_id TEXT NOT NULL REFERENCES custom_columns(id) ON DELETE CASCADE,
      position_after TEXT,
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      modify_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (table_id, column_id)
    );
    "#,
    "ALTER TABLE table_custom_columns ADD COLUMN IF NOT EXISTS position_after TEXT, ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS who_last_modified TEXT, ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;",
    "DROP TRIGGER IF EXISTS trg_table_custom_columns_when_last_modified ON table_custom_columns;",
    "CREATE TRIGGER trg_table_custom_columns_when_last_modified BEFORE UPDATE ON table_custom_columns FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    "CREATE INDEX IF NOT EXISTS idx_table_custom_columns_column_id ON table_custom_columns (column_id);",
    r#"
    CREATE TABLE IF NOT EXISTS table_rows (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      who_last_modified TEXT,
      when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      modify_count INTEGER NOT NULL DEFAULT 0
    );
    "#,
    "ALTER TABLE table_rows ADD COLUMN IF NOT EXISTS table_id TEXT, ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS who_last_modified TEXT, ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;",
    "DROP TRIGGER IF EXISTS trg_table_rows_when_last_modified ON table_rows;",
    "CREATE TRIGGER trg_table_rows_when_last_modified BEFORE UPDATE ON table_rows FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();",
    "CREATE INDEX IF NOT EXISTS idx_table_rows_table_id ON table_rows (table_id, when_created DESC);",
    "CREATE INDEX IF NOT EXISTS idx_table_rows_custom_values_gin ON table_rows USING gin (custom_values);",
    r#"
    DO $$
    DECLARE
      t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['remarks','remark_targets','custom_columns','cell_flags','hidden_rows','hidden_columns','operations_log','tables','github_repos','table_custom_columns','table_rows'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      END LOOP;
    END $$;
    "#,
    // Ensure Supabase JWT roles exist so RLS policies compile on plain Postgres (Neon, local dev).
    // On real Supabase these roles already exist; the DO block is a no-op there.
    r#"
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
    END $$;
    "#,
    "DROP POLICY IF EXISTS remarks_public_read ON remarks;",
    "DROP POLICY IF EXISTS remark_targets_public_read ON remark_targets;",
    "DROP POLICY IF EXISTS custom_cols_public_read ON custom_columns;",
    "DROP POLICY IF EXISTS custom_cols_auth_write ON custom_columns;",
    "DROP POLICY IF EXISTS flags_public_read ON cell_flags;",
    "DROP POLICY IF EXISTS hidden_rows_public_read ON hidden_rows;",
    "DROP POLICY IF EXISTS hidden_cols_public_read ON hidden_columns;",
    "DROP POLICY IF EXISTS ops_log_public_read ON operations_log;",
    "DROP POLICY IF EXISTS tables_public_read ON tables;",
    "DROP POLICY IF EXISTS tables_auth_write ON tables;",
    "DROP POLICY IF EXISTS gh_repos_public_read ON github_repos;",
    "DROP POLICY IF EXISTS table_custom_columns_public_read ON table_custom_columns;",
    "DROP POLICY IF EXISTS table_custom_columns_auth_write ON table_custom_columns;",
    "DROP POLICY IF EXISTS table_rows_public_read ON table_rows;",
    "DROP POLICY IF EXISTS table_rows_auth_write ON table_rows;",
    "CREATE POLICY remarks_public_read ON remarks FOR SELECT USING (true);",
    "CREATE POLICY remark_targets_public_read ON remark_targets FOR SELECT USING (true);",
    "CREATE POLICY custom_cols_public_read ON custom_columns FOR SELECT USING (true);",
    "CREATE POLICY custom_cols_auth_write ON custom_columns FOR ALL TO authenticated USING (true) WITH CHECK (true);",
    "CREATE POLICY flags_public_read ON cell_flags FOR SELECT USING (true);",
    "CREATE POLICY hidden_rows_public_read ON hidden_rows FOR SELECT USING (true);",
    "CREATE POLICY hidden_cols_public_read ON hidden_columns FOR SELECT USING (true);",
    "CREATE POLICY ops_log_public_read ON operations_log FOR SELECT USING (true);",
    "CREATE POLICY tables_public_read ON tables FOR SELECT USING (true);",
    "CREATE POLICY tables_auth_write ON tables FOR ALL TO authenticated USING (true) WITH CHECK (true);",
    "CREATE POLICY gh_repos_public_read ON github_repos FOR SELECT USING (true);",
    "CREATE POLICY table_custom_columns_public_read ON table_custom_columns FOR SELECT USING (true);",
    "CREATE POLICY table_custom_columns_auth_write ON table_custom_columns FOR ALL TO authenticated USING (true) WITH CHECK (true);",
    "CREATE POLICY table_rows_public_read ON table_rows FOR SELECT USING (true);",
    "CREATE POLICY table_rows_auth_write ON table_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);",
    // ── Per-user-table physical tables ────────────────────────────────────────
    // For every entry in the `tables` registry, ensure a physical PG table exists
    // (named "t_<id>") with a custom_vals JSONB column and GIN index.
    // Also migrates any legacy rows from the old flat `table_rows` table.
    r#"
    DO $$
    DECLARE
      t   RECORD;
      tbl TEXT;
    BEGIN
      FOR t IN SELECT id FROM tables LOOP
        tbl := 't_' || t.id;
        EXECUTE format($sql$
          CREATE TABLE IF NOT EXISTS %I (
            id                TEXT        PRIMARY KEY,
            when_created      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            when_last_modified TIMESTAMPTZ,
            who_created       TEXT,
            who_last_modified TEXT,
            modify_count      INTEGER     NOT NULL DEFAULT 0,
            custom_vals       JSONB       NOT NULL DEFAULT '{}'::jsonb
          )
        $sql$, tbl);
        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS %I ON %I USING GIN (custom_vals)',
          'idx_' || t.id || '_custom_vals', tbl
        );
        -- Migrate legacy rows from the flat table_rows table if it exists.
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'table_rows') THEN
          EXECUTE format($sql$
            INSERT INTO %I (id, when_created, when_last_modified,
                            who_created, who_last_modified, modify_count, custom_vals)
            SELECT id, when_created, when_last_modified,
                   who_created, who_last_modified, modify_count, custom_values
            FROM table_rows WHERE table_id = %L
            ON CONFLICT (id) DO NOTHING
          $sql$, tbl, t.id);
        END IF;
      END LOOP;
    END $$;
    "#,
];
// Builtin column seeding has moved to seed::upload_to_structable, which uses the DataStore
// trait and therefore works on all backends (Postgres, Mongo, Surreal, CouchDB, SQLite).

