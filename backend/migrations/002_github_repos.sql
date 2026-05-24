-- GitHub repos snapshot table
-- Apply via: Supabase SQL editor or `supabase db push`

-- ─────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS github_repos (
  -- identity
  github_id       bigint      PRIMARY KEY,
  name            text        NOT NULL,   -- "owner/repo"
  url             text        NOT NULL,

  -- core metrics
  stars           integer     NOT NULL DEFAULT 0,
  forks           integer     NOT NULL DEFAULT 0,
  open_issues     integer     NOT NULL DEFAULT 0,
  watchers        integer     NOT NULL DEFAULT 0,
  size            integer     NOT NULL DEFAULT 0,
  stars_now       integer     NOT NULL DEFAULT 0,

  -- stars delta time windows (stored so they can be indexed)
  stars_diff      jsonb       NOT NULL DEFAULT '{}',
  stars_diff_6h   integer     GENERATED ALWAYS AS ((stars_diff->>'6h')::integer)  STORED,
  stars_diff_12h  integer     GENERATED ALWAYS AS ((stars_diff->>'12h')::integer) STORED,
  stars_diff_24h  integer     GENERATED ALWAYS AS ((stars_diff->>'24h')::integer) STORED,
  stars_diff_48h  integer     GENERATED ALWAYS AS ((stars_diff->>'48h')::integer) STORED,
  stars_diff_5d   integer     GENERATED ALWAYS AS ((stars_diff->>'5d')::integer)  STORED,
  stars_diff_7d   integer     GENERATED ALWAYS AS ((stars_diff->>'7d')::integer)  STORED,
  stars_diff_10d  integer     GENERATED ALWAYS AS ((stars_diff->>'10d')::integer) STORED,
  stars_diff_14d  integer     GENERATED ALWAYS AS ((stars_diff->>'14d')::integer) STORED,
  stars_diff_20d  integer     GENERATED ALWAYS AS ((stars_diff->>'20d')::integer) STORED,
  stars_diff_30d  integer     GENERATED ALWAYS AS ((stars_diff->>'30d')::integer) STORED,

  -- categorisation
  language        text,
  license         text,
  visibility      text        NOT NULL DEFAULT 'public',
  default_branch  text        NOT NULL DEFAULT 'main',

  -- flags
  archived        boolean     NOT NULL DEFAULT false,
  disabled        boolean     NOT NULL DEFAULT false,
  has_issues      boolean     NOT NULL DEFAULT true,
  has_projects    boolean     NOT NULL DEFAULT true,
  has_wiki        boolean     NOT NULL DEFAULT true,
  has_pages       boolean     NOT NULL DEFAULT false,
  has_downloads   boolean     NOT NULL DEFAULT true,

  -- timestamps
  pushed_at       timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  fetched_at      timestamptz NOT NULL DEFAULT now(),

  -- content
  description     text,
  homepage        text,
  topics          text[]      NOT NULL DEFAULT '{}',

  -- owner
  owner_login     text        NOT NULL,
  owner_avatar    text,
  owner_url       text
);

-- ─────────────────────────────────────────────
-- Indexes (sort + filter on every useful field)
-- ─────────────────────────────────────────────

-- numeric metrics
CREATE INDEX IF NOT EXISTS idx_gh_stars           ON github_repos (stars          DESC);
CREATE INDEX IF NOT EXISTS idx_gh_forks           ON github_repos (forks          DESC);
CREATE INDEX IF NOT EXISTS idx_gh_open_issues     ON github_repos (open_issues    DESC);
CREATE INDEX IF NOT EXISTS idx_gh_watchers        ON github_repos (watchers       DESC);
CREATE INDEX IF NOT EXISTS idx_gh_size            ON github_repos (size           DESC);
CREATE INDEX IF NOT EXISTS idx_gh_stars_now       ON github_repos (stars_now      DESC);

-- stars delta windows
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_6h        ON github_repos (stars_diff_6h  DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_12h       ON github_repos (stars_diff_12h DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_24h       ON github_repos (stars_diff_24h DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_48h       ON github_repos (stars_diff_48h DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_5d        ON github_repos (stars_diff_5d  DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_7d        ON github_repos (stars_diff_7d  DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_10d       ON github_repos (stars_diff_10d DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_14d       ON github_repos (stars_diff_14d DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_20d       ON github_repos (stars_diff_20d DESC);
CREATE INDEX IF NOT EXISTS idx_gh_sdiff_30d       ON github_repos (stars_diff_30d DESC);

-- timestamps
CREATE INDEX IF NOT EXISTS idx_gh_pushed_at       ON github_repos (pushed_at      DESC);
CREATE INDEX IF NOT EXISTS idx_gh_created_at      ON github_repos (created_at     DESC);
CREATE INDEX IF NOT EXISTS idx_gh_updated_at      ON github_repos (updated_at     DESC);
CREATE INDEX IF NOT EXISTS idx_gh_fetched_at      ON github_repos (fetched_at     DESC);

-- low-cardinality text (equality / GROUP BY)
CREATE INDEX IF NOT EXISTS idx_gh_language        ON github_repos (language);
CREATE INDEX IF NOT EXISTS idx_gh_license         ON github_repos (license);
CREATE INDEX IF NOT EXISTS idx_gh_visibility      ON github_repos (visibility);
CREATE INDEX IF NOT EXISTS idx_gh_owner_login     ON github_repos (owner_login);
CREATE INDEX IF NOT EXISTS idx_gh_default_branch  ON github_repos (default_branch);

-- boolean flags (partial indexes keep them small)
CREATE INDEX IF NOT EXISTS idx_gh_archived_true   ON github_repos (github_id) WHERE archived  = true;
CREATE INDEX IF NOT EXISTS idx_gh_disabled_true   ON github_repos (github_id) WHERE disabled  = true;
CREATE INDEX IF NOT EXISTS idx_gh_has_pages       ON github_repos (github_id) WHERE has_pages  = true;

-- array: GIN for @>, &&, ANY
CREATE INDEX IF NOT EXISTS idx_gh_topics_gin      ON github_repos USING gin (topics);

-- ─────────────────────────────────────────────
-- RLS (public read, no write from client)
-- ─────────────────────────────────────────────

ALTER TABLE github_repos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gh_repos_public_read" ON github_repos
  FOR SELECT USING (true);

-- writes only via service-role key (backend ingestion)
