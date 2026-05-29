-- Rename col_type TEXT → col_types TEXT[] on the columns table.
-- Unifies with custom_columns.types; enables multiple accepted types per column.
--
-- Legacy mapping applied during data migration:
--   'mixed'  → all known types (was the old catch-all value)
--   'number' → 'integer'     (align naming with custom_columns)
--   anything else → single-element array of itself

ALTER TABLE columns
  ADD COLUMN col_types TEXT[];

UPDATE columns
  SET col_types = CASE col_type
    WHEN 'mixed'  THEN ARRAY['text','integer','boolean','url','array','jsonb','timestamptz']
    WHEN 'number' THEN ARRAY['integer']
    ELSE               ARRAY[col_type]
  END;

ALTER TABLE columns
  ALTER COLUMN col_types SET NOT NULL,
  ALTER COLUMN col_types SET DEFAULT ARRAY['text'];

ALTER TABLE columns
  ADD CONSTRAINT columns_col_types_check
    CHECK (
      col_types <@ ARRAY['text','integer','boolean','url','array','jsonb','timestamptz']
      AND array_length(col_types, 1) > 0
    );

ALTER TABLE columns
  DROP COLUMN col_type;
