-- Add data_types to custom_columns to drive filter UI without hardcoding in frontend.
-- Array of ColType values: 'numeric' | 'text' | 'categorical' | 'boolean'.
-- Multiple values allow a column to be filtered in more than one way.

ALTER TABLE custom_columns
  ADD COLUMN IF NOT EXISTS data_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD CONSTRAINT custom_columns_data_types_check
    CHECK (data_types <@ ARRAY['numeric', 'text', 'categorical', 'boolean']::TEXT[]);

-- Seed built-in GitHub columns with their filter types
UPDATE custom_columns SET data_types = ARRAY['text']        WHERE id IN ('gh_name', 'gh_description');
UPDATE custom_columns SET data_types = ARRAY['categorical'] WHERE id IN ('gh_language', 'gh_license', 'gh_visibility', 'gh_owner_login');
UPDATE custom_columns SET data_types = ARRAY['numeric']     WHERE id IN ('gh_stars', 'gh_forks', 'gh_open_issues', 'gh_watchers', 'gh_size', 'gh_stars_now');
UPDATE custom_columns SET data_types = ARRAY['numeric']     WHERE id LIKE 'gh_stars_diff_%' AND is_group = false;
UPDATE custom_columns SET data_types = ARRAY['boolean']     WHERE id IN ('gh_archived', 'gh_disabled');

-- source_path: nested JSONB paths for stars_diff windows, derived from actual API row shape:
-- custom_values -> { ..., "stars_diff": { "6h": N, "12h": N, "24h": N, "48h": N,
--                                         "5d": N, "7d": N, "10d": N, "14d": N,
--                                         "20d": N, "30d": N } }
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '6h']  WHERE id = 'gh_stars_diff_6h';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '12h'] WHERE id = 'gh_stars_diff_12h';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '24h'] WHERE id = 'gh_stars_diff_24h';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '48h'] WHERE id = 'gh_stars_diff_48h';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '5d']  WHERE id = 'gh_stars_diff_5d';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '7d']  WHERE id = 'gh_stars_diff_7d';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '10d'] WHERE id = 'gh_stars_diff_10d';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '14d'] WHERE id = 'gh_stars_diff_14d';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '20d'] WHERE id = 'gh_stars_diff_20d';
UPDATE custom_columns SET source_path = ARRAY['stars_diff', '30d'] WHERE id = 'gh_stars_diff_30d';
