-- Store editability as explicit metadata on the column object.
-- Keep the older is_editable column in sync for compatibility with existing code
-- and databases that already received that migration.
ALTER TABLE custom_columns
  ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false;

UPDATE custom_columns
  SET read_only = true
  WHERE id LIKE 'gh_%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'custom_columns'
      AND column_name = 'is_editable'
  ) THEN
    UPDATE custom_columns SET read_only = NOT is_editable;
  END IF;
END $$;
