-- =============================================================================
-- Migration 001: per-document print configuration
-- =============================================================================
-- Adds a single `print_config` jsonb column to the single-row print_settings
-- table (id = 1). This stores the shop-wide mapping of each document type
-- (THERMAL / FAKTUR / DO) to a transport (WEBUSB / WEBSERIAL / AGENT / KIOSK /
-- DIALOG) plus optional printer name and thermal paper profile (58mm / 76mm /
-- 80mm). Paired USB/Serial
-- device serials are machine-local and are NOT stored here.
--
-- This migration is IDEMPOTENT:
--   * ADD COLUMN IF NOT EXISTS  -> re-running never errors on the column.
--   * the seed UPDATE only fires when print_config IS NULL, so an existing
--     configuration is never overwritten on re-run.
--
-- HOW TO APPLY (pick one):
--   * Supabase Dashboard -> SQL Editor -> paste this file -> Run.   (easiest)
--   * psql:  psql "<connection-string>" -f db/migrations/001_print_config.sql
--       Get <connection-string> from Supabase Dashboard -> Project Settings ->
--       Database -> "Connection string" (URI). Example:
--       psql "postgresql://postgres:[PWD]@db.[REF].supabase.co:5432/postgres" \
--            -f db/migrations/001_print_config.sql
-- =============================================================================

alter table print_settings add column if not exists print_config jsonb;

-- Seed the single config row (id = 1) with DEFAULT_PRINT_CONFIG from
-- lib/printing/types.ts, but only if it has not been configured yet.
update print_settings
   set print_config = '{
     "THERMAL": { "transport": "DIALOG", "paper": "76mm" },
     "FAKTUR":  { "transport": "KIOSK" },
     "DO":      { "transport": "KIOSK" }
   }'::jsonb
 where id = 1
   and print_config is null;
