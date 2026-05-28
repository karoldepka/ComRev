-- github_repos redesign: collapse all GitHub API columns into custom_values JSONB.
-- Built-in columns: id (TEXT), when_created, who_created, when_last_modified, who_last_modified.
-- Existing rows are migrated into custom_values before the old table is dropped.
-- id = github_id::text – stable, deterministic, keeps upserts working.

-- ── Extend custom_columns with type ────────────────────────────────────────────
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text';

-- ── Trigger helper ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_when_last_modified()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.when_last_modified := NOW();
  RETURN NEW;
END;
$$;

-- ── Create new table under a temporary name ─────────────────────────────────────
CREATE TABLE github_repos_new (
  id                  TEXT        PRIMARY KEY,
  when_created        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  who_created         TEXT,
  when_last_modified  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  who_last_modified   TEXT,
  custom_values       JSONB       NOT NULL DEFAULT '{}'
);

-- ── Migrate existing rows ───────────────────────────────────────────────────────
-- stars_diff generated columns are derived values; we store only the base JSONB.
INSERT INTO github_repos_new (id, when_created, when_last_modified, custom_values)
SELECT
  github_id::text,
  COALESCE(fetched_at, NOW()),
  COALESCE(updated_at, fetched_at, NOW()),
  jsonb_strip_nulls(jsonb_build_object(
    'github_id',          github_id,
    'name',               name,
    'url',                url,
    'description',        description,
    'homepage',           homepage,
    'stars',              stars,
    'forks',              forks,
    'open_issues',        open_issues,
    'watchers',           watchers,
    'size',               size,
    'stars_now',          stars_now,
    'stars_diff',         stars_diff,
    'language',           language,
    'license',            license,
    'topics',             to_jsonb(topics),
    'visibility',         visibility,
    'default_branch',     default_branch,
    'archived',           archived,
    'disabled',           disabled,
    'has_issues',         has_issues,
    'has_projects',       has_projects,
    'has_wiki',           has_wiki,
    'has_pages',          has_pages,
    'has_downloads',      has_downloads,
    'pushed_at',          pushed_at,
    'github_created_at',  created_at,
    'github_updated_at',  updated_at,
    'fetched_at',         fetched_at,
    'owner_login',        owner_login,
    'owner_avatar',       owner_avatar,
    'owner_url',          owner_url
  ))
FROM github_repos;

-- ── Swap old table for new ──────────────────────────────────────────────────────
DROP TABLE github_repos CASCADE;
ALTER TABLE github_repos_new RENAME TO github_repos;

-- ── Trigger ────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_gh_repos_when_last_modified
  BEFORE UPDATE ON github_repos
  FOR EACH ROW EXECUTE FUNCTION set_when_last_modified();

-- ── Indexes on built-in columns ────────────────────────────────────────────────
CREATE INDEX idx_gh_when_created        ON github_repos (when_created       DESC);
CREATE INDEX idx_gh_who_created         ON github_repos (who_created);
CREATE INDEX idx_gh_when_last_modified  ON github_repos (when_last_modified DESC);
CREATE INDEX idx_gh_who_last_modified   ON github_repos (who_last_modified);

-- ── GIN index on custom_values (containment / key-existence queries) ───────────
CREATE INDEX idx_gh_cv_gin              ON github_repos USING gin (custom_values);

-- ── Expression indexes for individual GitHub API fields ────────────────────────

-- Identity – unique lookup by GitHub numeric ID
CREATE UNIQUE INDEX idx_gh_cv_github_id      ON github_repos (((custom_values->>'github_id')::bigint));

-- Text fields
CREATE INDEX idx_gh_cv_name                  ON github_repos ((custom_values->>'name'));
CREATE INDEX idx_gh_cv_language              ON github_repos ((custom_values->>'language'));
CREATE INDEX idx_gh_cv_license               ON github_repos ((custom_values->>'license'));
CREATE INDEX idx_gh_cv_visibility            ON github_repos ((custom_values->>'visibility'));
CREATE INDEX idx_gh_cv_owner_login           ON github_repos ((custom_values->>'owner_login'));
CREATE INDEX idx_gh_cv_default_branch        ON github_repos ((custom_values->>'default_branch'));

-- Numeric metrics (DESC for sort)
CREATE INDEX idx_gh_cv_stars                 ON github_repos (((custom_values->>'stars')::integer)       DESC);
CREATE INDEX idx_gh_cv_forks                 ON github_repos (((custom_values->>'forks')::integer)       DESC);
CREATE INDEX idx_gh_cv_open_issues           ON github_repos (((custom_values->>'open_issues')::integer) DESC);
CREATE INDEX idx_gh_cv_watchers              ON github_repos (((custom_values->>'watchers')::integer)    DESC);
CREATE INDEX idx_gh_cv_size                  ON github_repos (((custom_values->>'size')::integer)        DESC);
CREATE INDEX idx_gh_cv_stars_now             ON github_repos (((custom_values->>'stars_now')::integer)   DESC);

-- Stars diff time windows (nested path: custom_values->'stars_diff'->>'Xh/Xd')
CREATE INDEX idx_gh_cv_sdiff_6h    ON github_repos (((custom_values->'stars_diff'->>'6h' )::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_12h   ON github_repos (((custom_values->'stars_diff'->>'12h')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_24h   ON github_repos (((custom_values->'stars_diff'->>'24h')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_48h   ON github_repos (((custom_values->'stars_diff'->>'48h')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_5d    ON github_repos (((custom_values->'stars_diff'->>'5d' )::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_7d    ON github_repos (((custom_values->'stars_diff'->>'7d' )::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_10d   ON github_repos (((custom_values->'stars_diff'->>'10d')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_14d   ON github_repos (((custom_values->'stars_diff'->>'14d')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_20d   ON github_repos (((custom_values->'stars_diff'->>'20d')::integer) DESC);
CREATE INDEX idx_gh_cv_sdiff_30d   ON github_repos (((custom_values->'stars_diff'->>'30d')::integer) DESC);

-- Timestamps — stored as ISO 8601 UTC strings; text sort == chronological sort, no cast needed
CREATE INDEX idx_gh_cv_pushed_at         ON github_repos ((custom_values->>'pushed_at')         DESC);
CREATE INDEX idx_gh_cv_github_created_at ON github_repos ((custom_values->>'github_created_at') DESC);
CREATE INDEX idx_gh_cv_github_updated_at ON github_repos ((custom_values->>'github_updated_at') DESC);
CREATE INDEX idx_gh_cv_fetched_at        ON github_repos ((custom_values->>'fetched_at')         DESC);

-- Boolean flags (partial indexes – only the minority true case is indexed)
CREATE INDEX idx_gh_cv_archived_true   ON github_repos (id) WHERE (custom_values->>'archived' )::boolean = true;
CREATE INDEX idx_gh_cv_disabled_true   ON github_repos (id) WHERE (custom_values->>'disabled' )::boolean = true;
CREATE INDEX idx_gh_cv_has_pages_true  ON github_repos (id) WHERE (custom_values->>'has_pages')::boolean = true;

-- Topics stored as JSONB array → GIN for @>, &&, ANY queries
CREATE INDEX idx_gh_cv_topics_gin ON github_repos USING gin ((custom_values->'topics'));

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE github_repos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gh_repos_public_read" ON github_repos FOR SELECT USING (true);

-- ── Register GitHub API column definitions ─────────────────────────────────────
INSERT INTO custom_columns (id, name, label, type, position_after) VALUES
  ('gh_github_id',      'github_id',         'GitHub ID',       'integer',     NULL),
  ('gh_name',           'name',              'Repository',       'text',        'gh_github_id'),
  ('gh_url',            'url',               'URL',              'url',         'gh_name'),
  ('gh_description',    'description',       'Description',      'text',        'gh_url'),
  ('gh_homepage',       'homepage',          'Homepage',         'url',         'gh_description'),
  ('gh_stars',          'stars',             'Stars',            'integer',     'gh_homepage'),
  ('gh_forks',          'forks',             'Forks',            'integer',     'gh_stars'),
  ('gh_open_issues',    'open_issues',       'Open Issues',      'integer',     'gh_forks'),
  ('gh_watchers',       'watchers',          'Watchers',         'integer',     'gh_open_issues'),
  ('gh_size',           'size',              'Size (KB)',        'integer',     'gh_watchers'),
  ('gh_stars_now',      'stars_now',         'Stars Now',        'integer',     'gh_size'),
  ('gh_stars_diff',     'stars_diff',        'Stars Diff',       'jsonb',       'gh_stars_now'),
  ('gh_language',       'language',          'Language',         'text',        'gh_stars_diff'),
  ('gh_license',        'license',           'License',          'text',        'gh_language'),
  ('gh_topics',         'topics',            'Topics',           'array',       'gh_license'),
  ('gh_visibility',     'visibility',        'Visibility',       'text',        'gh_topics'),
  ('gh_default_branch', 'default_branch',    'Default Branch',   'text',        'gh_visibility'),
  ('gh_archived',       'archived',          'Archived',         'boolean',     'gh_default_branch'),
  ('gh_disabled',       'disabled',          'Disabled',         'boolean',     'gh_archived'),
  ('gh_has_issues',     'has_issues',        'Has Issues',       'boolean',     'gh_disabled'),
  ('gh_has_projects',   'has_projects',      'Has Projects',     'boolean',     'gh_has_issues'),
  ('gh_has_wiki',       'has_wiki',          'Has Wiki',         'boolean',     'gh_has_projects'),
  ('gh_has_pages',      'has_pages',         'Has Pages',        'boolean',     'gh_has_wiki'),
  ('gh_has_downloads',  'has_downloads',     'Has Downloads',    'boolean',     'gh_has_pages'),
  ('gh_pushed_at',      'pushed_at',         'Last Push',        'timestamptz', 'gh_has_downloads'),
  ('gh_github_created', 'github_created_at', 'GitHub Created',   'timestamptz', 'gh_pushed_at'),
  ('gh_github_updated', 'github_updated_at', 'GitHub Updated',   'timestamptz', 'gh_github_created'),
  ('gh_fetched_at',     'fetched_at',        'Last Fetched',     'timestamptz', 'gh_github_updated'),
  ('gh_owner_login',    'owner_login',       'Owner',            'text',        'gh_fetched_at'),
  ('gh_owner_avatar',   'owner_avatar',      'Owner Avatar',     'url',         'gh_owner_login'),
  ('gh_owner_url',      'owner_url',         'Owner URL',        'url',         'gh_owner_avatar')
ON CONFLICT (id) DO NOTHING;
