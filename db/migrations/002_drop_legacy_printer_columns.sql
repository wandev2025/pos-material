-- =============================================================================
-- Migration 002: drop legacy per-printer name columns  (OPTIONAL cleanup)
-- =============================================================================
-- The old `thermal_printer_name` / `invoice_printer_name` / `do_printer_name`
-- columns were superseded by `print_config` (migration 001). Nothing in the app
-- reads or writes them anymore, so they are dead schema. This migration removes
-- them.
--
-- This is OPTIONAL — leaving the columns in place is harmless; the app simply
-- ignores them. Run it only if you want a clean schema.
--
-- This migration is IDEMPOTENT:
--   * DROP COLUMN IF EXISTS -> re-running never errors on a missing column.
--
-- HOW TO APPLY (pick one):
--   * Supabase Dashboard -> SQL Editor -> paste this file -> Run.   (easiest)
--   * psql:  psql "<connection-string>" -f db/migrations/002_drop_legacy_printer_columns.sql
--       Get <connection-string> from Supabase Dashboard -> Project Settings ->
--       Database -> "Connection string" (URI).
-- =============================================================================

alter table print_settings drop column if exists thermal_printer_name;
alter table print_settings drop column if exists invoice_printer_name;
alter table print_settings drop column if exists do_printer_name;
