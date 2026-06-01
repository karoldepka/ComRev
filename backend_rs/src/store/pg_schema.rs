use anyhow::Result;
use sqlx::PgPool;

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
      name TEXT NOT NULL,
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
    r#"
    ALTER TABLE custom_columns
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
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'custom_columns' AND column_name = 'created_at'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'custom_columns' AND column_name = 'when_created'
      ) THEN
        ALTER TABLE custom_columns RENAME COLUMN created_at TO when_created;
      END IF;

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
      id TEXT PRIMARY KEY,
      op TEXT NOT NULL,
      payload JSONB NOT NULL,
      tx_id TEXT,
      client_id TEXT,
      who_created TEXT,
      when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_at TIMESTAMPTZ
    );
    "#,
    "ALTER TABLE operations_log ADD COLUMN IF NOT EXISTS tx_id TEXT, ADD COLUMN IF NOT EXISTS client_id TEXT, ADD COLUMN IF NOT EXISTS who_created TEXT, ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;",
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
    INSERT INTO tables (id, title, description)
    VALUES ('gh_repos', 'GitHub Repositories', 'Comparison table for GitHub repositories, auto-populated from the GitHub API.')
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;
    "#,
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
];

const BUILTIN_COLUMNS: &[(
    &str,
    &str,
    &str,
    &str,
    Option<&str>,
    bool,
    bool,
    &[&str],
    &[&str],
    &[&str],
)] = &[
    (
        "gh_group",
        "github",
        "GitHub",
        "text",
        None,
        true,
        true,
        &[],
        &[],
        &[],
    ),
    (
        "gh_github_id",
        "github_id",
        "GitHub ID",
        "integer",
        None,
        true,
        false,
        &["gh_group"],
        &["github_id"],
        &["numeric"],
    ),
    (
        "gh_name",
        "name",
        "Repository",
        "text",
        Some("gh_github_id"),
        true,
        false,
        &["gh_group"],
        &["name"],
        &["text"],
    ),
    (
        "gh_url",
        "url",
        "URL",
        "url",
        Some("gh_name"),
        true,
        false,
        &["gh_group"],
        &["url"],
        &["text"],
    ),
    (
        "gh_description",
        "description",
        "Description",
        "text",
        Some("gh_url"),
        true,
        false,
        &["gh_group"],
        &["description"],
        &["text"],
    ),
    (
        "gh_homepage",
        "homepage",
        "Homepage",
        "url",
        Some("gh_description"),
        true,
        false,
        &["gh_group"],
        &["homepage"],
        &["text"],
    ),
    (
        "gh_stars",
        "stars",
        "Stars",
        "integer",
        Some("gh_homepage"),
        true,
        false,
        &["gh_group"],
        &["stars"],
        &["numeric"],
    ),
    (
        "gh_forks",
        "forks",
        "Forks",
        "integer",
        Some("gh_stars"),
        true,
        false,
        &["gh_group"],
        &["forks"],
        &["numeric"],
    ),
    (
        "gh_open_issues",
        "open_issues",
        "Open Issues",
        "integer",
        Some("gh_forks"),
        true,
        false,
        &["gh_group"],
        &["open_issues"],
        &["numeric"],
    ),
    (
        "gh_watchers",
        "watchers",
        "Watchers",
        "integer",
        Some("gh_open_issues"),
        true,
        false,
        &["gh_group"],
        &["watchers"],
        &["numeric"],
    ),
    (
        "gh_size",
        "size",
        "Size (KB)",
        "integer",
        Some("gh_watchers"),
        true,
        false,
        &["gh_group"],
        &["size"],
        &["numeric"],
    ),
    (
        "gh_stars_now",
        "stars_now",
        "Stars Now",
        "integer",
        Some("gh_size"),
        true,
        false,
        &["gh_group"],
        &["stars_now"],
        &["numeric"],
    ),
    (
        "gh_stars_diff",
        "stars_diff",
        "GitHub Stars diff",
        "jsonb",
        Some("gh_stars_now"),
        true,
        true,
        &["gh_group"],
        &["stars_diff"],
        &[],
    ),
    (
        "gh_stars_diff_6h",
        "stars_diff_6h",
        "6h",
        "integer",
        None,
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "6h"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_12h",
        "stars_diff_12h",
        "12h",
        "integer",
        Some("gh_stars_diff_6h"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "12h"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_24h",
        "stars_diff_24h",
        "24h",
        "integer",
        Some("gh_stars_diff_12h"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "24h"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_48h",
        "stars_diff_48h",
        "48h",
        "integer",
        Some("gh_stars_diff_24h"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "48h"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_5d",
        "stars_diff_5d",
        "5d",
        "integer",
        Some("gh_stars_diff_48h"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "5d"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_7d",
        "stars_diff_7d",
        "7d",
        "integer",
        Some("gh_stars_diff_5d"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "7d"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_10d",
        "stars_diff_10d",
        "10d",
        "integer",
        Some("gh_stars_diff_7d"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "10d"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_14d",
        "stars_diff_14d",
        "14d",
        "integer",
        Some("gh_stars_diff_10d"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "14d"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_20d",
        "stars_diff_20d",
        "20d",
        "integer",
        Some("gh_stars_diff_14d"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "20d"],
        &["numeric"],
    ),
    (
        "gh_stars_diff_30d",
        "stars_diff_30d",
        "30d",
        "integer",
        Some("gh_stars_diff_20d"),
        true,
        false,
        &["gh_stars_diff"],
        &["stars_diff", "30d"],
        &["numeric"],
    ),
    (
        "gh_language",
        "language",
        "Language",
        "text",
        Some("gh_stars_diff"),
        true,
        false,
        &["gh_group"],
        &["language"],
        &["categorical"],
    ),
    (
        "gh_license",
        "license",
        "License",
        "text",
        Some("gh_language"),
        true,
        false,
        &["gh_group"],
        &["license"],
        &["categorical"],
    ),
    (
        "gh_topics",
        "topics",
        "Topics",
        "array",
        Some("gh_license"),
        true,
        false,
        &["gh_group"],
        &["topics"],
        &["categorical"],
    ),
    (
        "gh_visibility",
        "visibility",
        "Visibility",
        "text",
        Some("gh_topics"),
        true,
        false,
        &["gh_group"],
        &["visibility"],
        &["categorical"],
    ),
    (
        "gh_default_branch",
        "default_branch",
        "Default Branch",
        "text",
        Some("gh_visibility"),
        true,
        false,
        &["gh_group"],
        &["default_branch"],
        &["categorical"],
    ),
    (
        "gh_archived",
        "archived",
        "Archived",
        "boolean",
        Some("gh_default_branch"),
        true,
        false,
        &["gh_group"],
        &["archived"],
        &["boolean"],
    ),
    (
        "gh_disabled",
        "disabled",
        "Disabled",
        "boolean",
        Some("gh_archived"),
        true,
        false,
        &["gh_group"],
        &["disabled"],
        &["boolean"],
    ),
    (
        "gh_has_issues",
        "has_issues",
        "Has Issues",
        "boolean",
        Some("gh_disabled"),
        true,
        false,
        &["gh_group"],
        &["has_issues"],
        &["boolean"],
    ),
    (
        "gh_has_projects",
        "has_projects",
        "Has Projects",
        "boolean",
        Some("gh_has_issues"),
        true,
        false,
        &["gh_group"],
        &["has_projects"],
        &["boolean"],
    ),
    (
        "gh_has_wiki",
        "has_wiki",
        "Has Wiki",
        "boolean",
        Some("gh_has_projects"),
        true,
        false,
        &["gh_group"],
        &["has_wiki"],
        &["boolean"],
    ),
    (
        "gh_has_pages",
        "has_pages",
        "Has Pages",
        "boolean",
        Some("gh_has_wiki"),
        true,
        false,
        &["gh_group"],
        &["has_pages"],
        &["boolean"],
    ),
    (
        "gh_has_downloads",
        "has_downloads",
        "Has Downloads",
        "boolean",
        Some("gh_has_pages"),
        true,
        false,
        &["gh_group"],
        &["has_downloads"],
        &["boolean"],
    ),
    (
        "gh_pushed_at",
        "pushed_at",
        "Last Push",
        "timestamptz",
        Some("gh_has_downloads"),
        true,
        false,
        &["gh_group"],
        &["pushed_at"],
        &["text"],
    ),
    (
        "gh_github_created",
        "github_created_at",
        "GitHub Created",
        "timestamptz",
        Some("gh_pushed_at"),
        true,
        false,
        &["gh_group"],
        &["github_created_at"],
        &["text"],
    ),
    (
        "gh_github_updated",
        "github_updated_at",
        "GitHub Updated",
        "timestamptz",
        Some("gh_github_created"),
        true,
        false,
        &["gh_group"],
        &["github_updated_at"],
        &["text"],
    ),
    (
        "gh_fetched_at",
        "fetched_at",
        "Last Fetched",
        "timestamptz",
        Some("gh_github_updated"),
        true,
        false,
        &["gh_group"],
        &["fetched_at"],
        &["text"],
    ),
    (
        "gh_owner_login",
        "owner_login",
        "Owner",
        "text",
        Some("gh_fetched_at"),
        true,
        false,
        &["gh_group"],
        &["owner_login"],
        &["categorical"],
    ),
    (
        "gh_owner_avatar",
        "owner_avatar",
        "Owner Avatar",
        "url",
        Some("gh_owner_login"),
        true,
        false,
        &["gh_group"],
        &["owner_avatar"],
        &["text"],
    ),
    (
        "gh_owner_url",
        "owner_url",
        "Owner URL",
        "url",
        Some("gh_owner_avatar"),
        true,
        false,
        &["gh_group"],
        &["owner_url"],
        &["text"],
    ),
];

pub async fn seed_builtin_columns(pool: &PgPool) -> Result<()> {
    for (
        id,
        name,
        label,
        ty,
        position_after,
        read_only,
        is_group,
        parent_ids,
        source_path,
        data_types,
    ) in BUILTIN_COLUMNS
    {
        sqlx::query(
            "INSERT INTO custom_columns
               (id, name, label, types, position_after, read_only, is_group, parent_ids, source_path, data_types)
             VALUES ($1, $2, $3, ARRAY[$4]::TEXT[], $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE
               SET name = EXCLUDED.name,
                   label = EXCLUDED.label,
                   types = EXCLUDED.types,
                   position_after = EXCLUDED.position_after,
                   read_only = EXCLUDED.read_only,
                   is_group = EXCLUDED.is_group,
                   parent_ids = EXCLUDED.parent_ids,
                   source_path = EXCLUDED.source_path,
                   data_types = EXCLUDED.data_types,
                   when_last_modified = NOW(),
                   modify_count = custom_columns.modify_count + 1",
        )
        .bind(id)
        .bind(name)
        .bind(label)
        .bind(ty)
        .bind(position_after)
        .bind(read_only)
        .bind(is_group)
        .bind(parent_ids)
        .bind(source_path)
        .bind(data_types)
        .execute(pool)
        .await?;
    }

    sqlx::query(
        "INSERT INTO table_custom_columns (table_id, column_id, position_after, is_frozen)
         SELECT 'gh_repos', id, position_after, name = 'name'
         FROM custom_columns
         WHERE id LIKE 'gh_%'
         ON CONFLICT (table_id, column_id) DO UPDATE
           SET position_after = EXCLUDED.position_after,
               is_frozen = EXCLUDED.is_frozen,
               when_last_modified = NOW()",
    )
    .execute(pool)
    .await?;

    Ok(())
}
