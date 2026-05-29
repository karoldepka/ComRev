-- Collapse github_repos flat columns → custom_values JSONB.
-- Only five built-in columns survive as real columns; all GitHub API fields move to custom_values.
-- id = github_id::text  (externally assigned by GitHub, globally unique, keeps upserts stable).

-- ── Align custom_columns with the "everything is an object" model ───────────────
-- Add type + full audit metadata; apply the same when_last_modified trigger.
ALTER TABLE custom_columns
  ADD COLUMN IF NOT EXISTS types              TEXT[]      NOT NULL DEFAULT ARRAY['text'],
  ADD COLUMN IF NOT EXISTS who_created        TEXT,
  ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS who_last_modified  TEXT;

-- Every element must be a known type; at least one type is required.
ALTER TABLE custom_columns
  ADD CONSTRAINT custom_columns_types_check
    CHECK (
      types <@ ARRAY['text','integer','boolean','url','array','jsonb','timestamptz']
      AND array_length(types, 1) > 0
    );

-- ── Shared trigger function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_when_last_modified()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.when_last_modified := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_custom_columns_when_last_modified
  BEFORE UPDATE ON custom_columns
  FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();

-- Authenticated users can manage their own custom columns.
CREATE POLICY "custom_cols_auth_write" ON custom_columns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── New table ───────────────────────────────────────────────────────────────────
CREATE TABLE github_repos_new (
  id                  TEXT        PRIMARY KEY,
  when_created        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  who_created         TEXT,
  when_last_modified  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  who_last_modified   TEXT,
  custom_values       JSONB       NOT NULL DEFAULT '{}'
);

-- ── Migrate existing rows ───────────────────────────────────────────────────────
-- stars_diff_Xh generated columns are dropped; base stars_diff JSONB is preserved.
-- created_at/updated_at renamed to github_created_at/github_updated_at to avoid
-- collision with the built-in when_created/when_last_modified columns.
INSERT INTO github_repos_new (id, when_created, when_last_modified, custom_values)
SELECT
  github_id::text,
  COALESCE(fetched_at, NOW()),
  COALESCE(updated_at, fetched_at, NOW()),
  jsonb_strip_nulls(jsonb_build_object(
    'github_id',         github_id,
    'name',              name,
    'url',               url,
    'description',       description,
    'homepage',          homepage,
    'stars',             stars,
    'forks',             forks,
    'open_issues',       open_issues,
    'watchers',          watchers,
    'size',              size,
    'stars_now',         stars_now,
    'stars_diff',        stars_diff,
    'language',          language,
    'license',           license,
    'topics',            to_jsonb(topics),
    'visibility',        visibility,
    'default_branch',    default_branch,
    'archived',          archived,
    'disabled',          disabled,
    'has_issues',        has_issues,
    'has_projects',      has_projects,
    'has_wiki',          has_wiki,
    'has_pages',         has_pages,
    'has_downloads',     has_downloads,
    'pushed_at',         pushed_at,
    'github_created_at', created_at,
    'github_updated_at', updated_at,
    'fetched_at',        fetched_at,
    'owner_login',       owner_login,
    'owner_avatar',      owner_avatar,
    'owner_url',         owner_url
  ))
FROM github_repos;

-- ── Swap ────────────────────────────────────────────────────────────────────────
DROP TABLE github_repos CASCADE;
ALTER TABLE github_repos_new RENAME TO github_repos;

-- ── Trigger ────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_gh_repos_when_last_modified
  BEFORE UPDATE ON github_repos
  FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();

-- ── Indexes: built-in columns ──────────────────────────────────────────────────
CREATE INDEX idx_gh_when_created        ON github_repos (when_created       DESC);
CREATE INDEX idx_gh_who_created         ON github_repos (who_created);
CREATE INDEX idx_gh_when_last_modified  ON github_repos (when_last_modified DESC);
CREATE INDEX idx_gh_who_last_modified   ON github_repos (who_last_modified);

-- ── Indexes: custom_values ─────────────────────────────────────────────────────

-- GIN covers containment / key-existence queries on the whole object
CREATE INDEX idx_gh_cv_gin          ON github_repos USING gin (custom_values);

-- numeric identity
CREATE UNIQUE INDEX idx_gh_cv_github_id  ON github_repos (((custom_values->>'github_id')::bigint));

-- sortable text
CREATE INDEX idx_gh_cv_name          ON github_repos ((custom_values->>'name'));
CREATE INDEX idx_gh_cv_language      ON github_repos ((custom_values->>'language'));
CREATE INDEX idx_gh_cv_license       ON github_repos ((custom_values->>'license'));
CREATE INDEX idx_gh_cv_visibility    ON github_repos ((custom_values->>'visibility'));
CREATE INDEX idx_gh_cv_owner_login   ON github_repos ((custom_values->>'owner_login'));
CREATE INDEX idx_gh_cv_default_branch ON github_repos ((custom_values->>'default_branch'));

-- sortable integers
CREATE INDEX idx_gh_cv_stars       ON github_repos (((custom_values->>'stars')::integer)       DESC);
CREATE INDEX idx_gh_cv_forks       ON github_repos (((custom_values->>'forks')::integer)       DESC);
CREATE INDEX idx_gh_cv_open_issues ON github_repos (((custom_values->>'open_issues')::integer) DESC);
CREATE INDEX idx_gh_cv_watchers    ON github_repos (((custom_values->>'watchers')::integer)    DESC);
CREATE INDEX idx_gh_cv_size        ON github_repos (((custom_values->>'size')::integer)        DESC);
CREATE INDEX idx_gh_cv_stars_now   ON github_repos (((custom_values->>'stars_now')::integer)   DESC);

-- stars diff windows nested under custom_values->'stars_diff'
CREATE INDEX idx_gh_cv_sdiff_6h   ON github_repos (((custom_values->'stars_diff'->>'6h' )::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_12h  ON github_repos (((custom_values->'stars_diff'->>'12h')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_24h  ON github_repos (((custom_values->'stars_diff'->>'24h')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_48h  ON github_repos (((custom_values->'stars_diff'->>'48h')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_5d   ON github_repos (((custom_values->'stars_diff'->>'5d' )::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_7d   ON github_repos (((custom_values->'stars_diff'->>'7d' )::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_10d  ON github_repos (((custom_values->'stars_diff'->>'10d')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_14d  ON github_repos (((custom_values->'stars_diff'->>'14d')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_20d  ON github_repos (((custom_values->'stars_diff'->>'20d')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_30d  ON github_repos (((custom_values->'stars_diff'->>'30d')::integer) DESC);

-- timestamps as ISO 8601 UTC text — lexicographic order == chronological order
CREATE INDEX idx_gh_cv_pushed_at         ON github_repos ((custom_values->>'pushed_at')         DESC);
CREATE INDEX idx_gh_cv_github_created_at ON github_repos ((custom_values->>'github_created_at') DESC);
CREATE INDEX idx_gh_cv_github_updated_at ON github_repos ((custom_values->>'github_updated_at') DESC);
CREATE INDEX idx_gh_cv_fetched_at        ON github_repos ((custom_values->>'fetched_at')         DESC);

-- partial indexes for the minority true case
CREATE INDEX idx_gh_cv_archived_true  ON github_repos (id) WHERE (custom_values->>'archived' )::boolean = true;
CREATE INDEX idx_gh_cv_disabled_true  ON github_repos (id) WHERE (custom_values->>'disabled' )::boolean = true;
CREATE INDEX idx_gh_cv_has_pages_true ON github_repos (id) WHERE (custom_values->>'has_pages')::boolean = true;

-- topics array inside JSONB
CREATE INDEX idx_gh_cv_topics_gin ON github_repos USING gin ((custom_values->'topics'));

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE github_repos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gh_repos_public_read" ON github_repos FOR SELECT USING (true);

-- ── Seed: GitHub API column definitions ────────────────────────────────────────
-- id prefix 'gh_' is the human-readable exception to the nanoid rule (CLAUDE.md).
-- name matches the key used in custom_values.
INSERT INTO custom_columns (id, name, label, types, position_after) VALUES
  ('gh_github_id',      'github_id',         'GitHub ID',       ARRAY['integer'],     NULL),
  ('gh_name',           'name',              'Repository',       ARRAY['text'],        'gh_github_id'),
  ('gh_url',            'url',               'URL',              ARRAY['url'],         'gh_name'),
  ('gh_description',    'description',       'Description',      ARRAY['text'],        'gh_url'),
  ('gh_homepage',       'homepage',          'Homepage',         ARRAY['url'],         'gh_description'),
  ('gh_stars',          'stars',             'Stars',            ARRAY['integer'],     'gh_homepage'),
  ('gh_forks',          'forks',             'Forks',            ARRAY['integer'],     'gh_stars'),
  ('gh_open_issues',    'open_issues',       'Open Issues',      ARRAY['integer'],     'gh_forks'),
  ('gh_watchers',       'watchers',          'Watchers',         ARRAY['integer'],     'gh_open_issues'),
  ('gh_size',           'size',              'Size (KB)',        ARRAY['integer'],     'gh_watchers'),
  ('gh_stars_now',      'stars_now',         'Stars Now',        ARRAY['integer'],     'gh_size'),
  ('gh_stars_diff',     'stars_diff',        'Stars Diff',       ARRAY['jsonb'],       'gh_stars_now'),
  ('gh_language',       'language',          'Language',         ARRAY['text'],        'gh_stars_diff'),
  ('gh_license',        'license',           'License',          ARRAY['text'],        'gh_language'),
  ('gh_topics',         'topics',            'Topics',           ARRAY['array'],       'gh_license'),
  ('gh_visibility',     'visibility',        'Visibility',       ARRAY['text'],        'gh_topics'),
  ('gh_default_branch', 'default_branch',    'Default Branch',   ARRAY['text'],        'gh_visibility'),
  ('gh_archived',       'archived',          'Archived',         ARRAY['boolean'],     'gh_default_branch'),
  ('gh_disabled',       'disabled',          'Disabled',         ARRAY['boolean'],     'gh_archived'),
  ('gh_has_issues',     'has_issues',        'Has Issues',       ARRAY['boolean'],     'gh_disabled'),
  ('gh_has_projects',   'has_projects',      'Has Projects',     ARRAY['boolean'],     'gh_has_issues'),
  ('gh_has_wiki',       'has_wiki',          'Has Wiki',         ARRAY['boolean'],     'gh_has_projects'),
  ('gh_has_pages',      'has_pages',         'Has Pages',        ARRAY['boolean'],     'gh_has_wiki'),
  ('gh_has_downloads',  'has_downloads',     'Has Downloads',    ARRAY['boolean'],     'gh_has_pages'),
  ('gh_pushed_at',      'pushed_at',         'Last Push',        ARRAY['timestamptz'], 'gh_has_downloads'),
  ('gh_github_created', 'github_created_at', 'GitHub Created',   ARRAY['timestamptz'], 'gh_pushed_at'),
  ('gh_github_updated', 'github_updated_at', 'GitHub Updated',   ARRAY['timestamptz'], 'gh_github_created'),
  ('gh_fetched_at',     'fetched_at',        'Last Fetched',     ARRAY['timestamptz'], 'gh_github_updated'),
  ('gh_owner_login',    'owner_login',       'Owner',            ARRAY['text'],        'gh_fetched_at'),
  ('gh_owner_avatar',   'owner_avatar',      'Owner Avatar',     ARRAY['url'],         'gh_owner_login'),
  ('gh_owner_url',      'owner_url',         'Owner URL',        ARRAY['url'],         'gh_owner_avatar')
ON CONFLICT (id) DO NOTHING;
