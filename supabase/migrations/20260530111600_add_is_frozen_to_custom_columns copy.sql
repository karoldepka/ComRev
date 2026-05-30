-- Add is_frozen to custom_columns table.
-- This allows setting a default frozen state for a column globally, 
-- though it can be overridden in table_custom_columns.

ALTER TABLE custom_columns
ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false;
