-- =============================================================================
-- Roles & access — offline SUPERADMIN bootstrap
-- =============================================================================
-- Role hierarchy: SUPERADMIN > OWNER > ADMIN > STAFF.
--
-- Public signup no longer chooses a role. Instead:
--   * the FIRST account ever created becomes SUPERADMIN automatically,
--   * every account after that becomes STAFF.
-- A SUPERADMIN / OWNER then promotes people from the in-app "Pengguna" screen.
--
-- HOW TO APPLY:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--
-- IMPORTANT: this REPLACES the new-user trigger that previously copied a role
-- out of the signup metadata. If your existing trigger has a name other than
-- `on_auth_user_created`, drop it too so two triggers don't both fire. Find it
-- with:
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- `profiles.role` is a plain text column in this project, so no enum/type
-- change is needed — SUPERADMIN is just another string value.
-- =============================================================================

-- First user becomes SUPERADMIN, everyone else STAFF.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if (select count(*) from public.profiles) = 0 then
    v_role := 'SUPERADMIN';
  else
    v_role := 'STAFF';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper to read the caller's role without recursive RLS lookups.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- RLS is ENABLED on `profiles` in this project, so the in-app "Pengguna" screen
-- needs these policies: a manager (SUPERADMIN/OWNER) may read every profile and
-- change roles. They are additive (permissive), so any existing
-- "read/update your own profile" policy keeps working alongside them.
drop policy if exists profiles_manager_read on public.profiles;
create policy profiles_manager_read on public.profiles for select
  using (auth.uid() = id or public.current_user_role() in ('SUPERADMIN','OWNER'));

drop policy if exists profiles_manager_update on public.profiles;
create policy profiles_manager_update on public.profiles for update
  using (public.current_user_role() in ('SUPERADMIN','OWNER'))
  with check (public.current_user_role() in ('SUPERADMIN','OWNER'));
