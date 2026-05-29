-- Add is_editable flag to custom_columns.
-- GitHub-seeded columns (id prefix 'gh_') are read-only; users may still add
-- remarks/flags on those cells but cannot overwrite values via the cell editor.

ALTER TABLE custom_columns
  ADD COLUMN IF NOT EXISTS is_editable BOOLEAN NOT NULL DEFAULT true;

UPDATE custom_columns SET is_editable = false WHERE id LIKE 'gh_%';
