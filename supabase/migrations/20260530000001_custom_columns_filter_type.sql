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
