-- Custom-column grouping and source metadata.
-- Groups are regular custom column definitions with is_group=true and read_only=true.
-- source_path lets a column expose a value nested inside custom_values without
-- hardcoding that field in the frontend.

ALTER TABLE custom_columns
  ADD COLUMN IF NOT EXISTS parent_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_path TEXT[];

CREATE INDEX IF NOT EXISTS idx_custom_columns_parent_ids ON custom_columns USING gin(parent_ids);

INSERT INTO custom_columns (
  id, name, label, types, position_after, read_only, is_group, parent_ids, source_path
) VALUES (
  'gh_group', 'github', 'GitHub', ARRAY['text'], NULL, true, true, ARRAY[]::TEXT[], NULL
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      label = EXCLUDED.label,
      types = EXCLUDED.types,
      position_after = EXCLUDED.position_after,
      read_only = EXCLUDED.read_only,
      is_group = EXCLUDED.is_group,
      parent_ids = EXCLUDED.parent_ids,
      source_path = EXCLUDED.source_path;

UPDATE custom_columns
   SET when_created = COALESCE((
     SELECT MIN(when_created) - INTERVAL '1 millisecond'
       FROM custom_columns
      WHERE id LIKE 'gh_%'
        AND id <> 'gh_group'
   ), when_created)
 WHERE id = 'gh_group';

UPDATE custom_columns
   SET parent_ids = ARRAY['gh_group'],
       read_only = true,
       source_path = COALESCE(source_path, ARRAY[name])
 WHERE id LIKE 'gh_%'
   AND id <> 'gh_group';

UPDATE custom_columns
   SET label = 'GitHub Stars diff',
       read_only = true,
       is_group = true,
       parent_ids = ARRAY['gh_group'],
       source_path = ARRAY['stars_diff']
 WHERE id = 'gh_stars_diff';

INSERT INTO custom_columns (
  id, name, label, types, position_after, read_only, is_group, parent_ids, source_path
) VALUES
  ('gh_stars_diff_6h',  'stars_diff_6h',  '6h',  ARRAY['integer'], NULL,                 true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '6h']),
  ('gh_stars_diff_12h', 'stars_diff_12h', '12h', ARRAY['integer'], 'gh_stars_diff_6h',   true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '12h']),
  ('gh_stars_diff_24h', 'stars_diff_24h', '24h', ARRAY['integer'], 'gh_stars_diff_12h',  true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '24h']),
  ('gh_stars_diff_48h', 'stars_diff_48h', '48h', ARRAY['integer'], 'gh_stars_diff_24h',  true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '48h']),
  ('gh_stars_diff_5d',  'stars_diff_5d',  '5d',  ARRAY['integer'], 'gh_stars_diff_48h',  true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '5d']),
  ('gh_stars_diff_7d',  'stars_diff_7d',  '7d',  ARRAY['integer'], 'gh_stars_diff_5d',   true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '7d']),
  ('gh_stars_diff_10d', 'stars_diff_10d', '10d', ARRAY['integer'], 'gh_stars_diff_7d',   true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '10d']),
  ('gh_stars_diff_14d', 'stars_diff_14d', '14d', ARRAY['integer'], 'gh_stars_diff_10d',  true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '14d']),
  ('gh_stars_diff_20d', 'stars_diff_20d', '20d', ARRAY['integer'], 'gh_stars_diff_14d',  true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '20d']),
  ('gh_stars_diff_30d', 'stars_diff_30d', '30d', ARRAY['integer'], 'gh_stars_diff_20d',  true, false, ARRAY['gh_stars_diff'], ARRAY['stars_diff', '30d'])
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      label = EXCLUDED.label,
      types = EXCLUDED.types,
      position_after = EXCLUDED.position_after,
      read_only = EXCLUDED.read_only,
      is_group = EXCLUDED.is_group,
      parent_ids = EXCLUDED.parent_ids,
      source_path = EXCLUDED.source_path;
