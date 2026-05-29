-- Standardize audit columns and schema across all operational tables.
-- These were previously managed by ensure_table() in Rust.

-- 1. remarks
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS who_created TEXT;
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS who_last_modified TEXT;
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;

-- 2. operations_log
ALTER TABLE operations_log ADD COLUMN IF NOT EXISTS tx_id TEXT;
ALTER TABLE operations_log ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE operations_log ADD COLUMN IF NOT EXISTS who_created TEXT;
ALTER TABLE operations_log ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. custom_columns
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS types TEXT[] NOT NULL DEFAULT ARRAY['text'];
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS who_created TEXT;
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS who_last_modified TEXT;
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE custom_columns ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;

-- 4. hidden_rows
ALTER TABLE hidden_rows ADD COLUMN IF NOT EXISTS who_created TEXT;
ALTER TABLE hidden_rows ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hidden_rows ADD COLUMN IF NOT EXISTS who_last_modified TEXT;
ALTER TABLE hidden_rows ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hidden_rows ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;

-- 5. hidden_columns
ALTER TABLE hidden_columns ADD COLUMN IF NOT EXISTS who_created TEXT;
ALTER TABLE hidden_columns ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hidden_columns ADD COLUMN IF NOT EXISTS who_last_modified TEXT;
ALTER TABLE hidden_columns ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hidden_columns ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;

-- 6. cell_flags
ALTER TABLE cell_flags ADD COLUMN IF NOT EXISTS who_created TEXT;
ALTER TABLE cell_flags ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE cell_flags ADD COLUMN IF NOT EXISTS who_last_modified TEXT;
ALTER TABLE cell_flags ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE cell_flags ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;

-- 7. tables
ALTER TABLE tables ADD COLUMN IF NOT EXISTS who_created TEXT;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS when_created TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tables ADD COLUMN IF NOT EXISTS who_last_modified TEXT;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tables ADD COLUMN IF NOT EXISTS modify_count INTEGER NOT NULL DEFAULT 0;
