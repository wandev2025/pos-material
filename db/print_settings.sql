-- =============================================================================
-- print_settings — shop profile, receipt footers, per-document print config
-- =============================================================================
-- The single-row (id = 1) table read by Setup and the POS print pipeline.
-- The table was originally created by hand in the Supabase dashboard and its
-- DDL was never captured in the repo (the short-lived db/migrations/ files
-- only ALTERed it). This file is the self-contained definition, so a fresh
-- database can be provisioned entirely from db/*.sql.
--
-- IDEMPOTENT — safe to re-run:
--   * create table if not exists / add column if not exists
--   * the seed insert is guarded by "on conflict do nothing"
--   * the print_config seed only fires while print_config is null, so an
--     existing configuration is never overwritten
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste this file -> Run.
-- =============================================================================

create table if not exists print_settings (
  id             bigint primary key,
  shop_name      text,
  shop_address   text,
  shop_phone     text,
  thermal_footer text,
  invoice_footer text,
  do_footer      text,
  print_config   jsonb,
  updated_at     timestamptz default now()
);

-- Databases created before the per-document printing system lack this column.
alter table print_settings add column if not exists print_config jsonb;

-- The app reads and writes exactly one row, id = 1.
insert into print_settings (id) values (1) on conflict (id) do nothing;

-- Seed the per-document transport map (mirrors DEFAULT_PRINT_CONFIG in
-- lib/printing/types.ts) only when it has never been configured.
update print_settings
   set print_config = '{
     "THERMAL": { "transport": "DIALOG", "paper": "76mm" },
     "FAKTUR":  { "transport": "KIOSK" },
     "DO":      { "transport": "KIOSK" }
   }'::jsonb
 where id = 1
   and print_config is null;

-- RLS: same single-policy model as every other table — any signed-in
-- (authenticated) user has full access; the anon key sees nothing.
alter table print_settings enable row level security;

drop policy if exists print_settings_authenticated_all on print_settings;
create policy print_settings_authenticated_all on print_settings
  for all to authenticated using (true) with check (true);

-- Legacy per-printer name columns, superseded by print_config. No-ops on a
-- fresh database; cleans up an old one.
alter table print_settings drop column if exists thermal_printer_name;
alter table print_settings drop column if exists invoice_printer_name;
alter table print_settings drop column if exists do_printer_name;
