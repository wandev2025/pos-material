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

-- Hierarchical removal. The role rank is SUPERADMIN(4) > OWNER(3) > ADMIN(2) >
-- STAFF(1); a caller may delete a user ONLY if their rank is strictly higher
-- than the target's, and never themselves. Enforced here (security definer) so
-- the shipped anon key can't bypass it, even though the UI also gates the button.
-- Deletes the auth user; the FK profiles.id -> auth.users(id) cascade removes the
-- profile (we also delete it explicitly in case the cascade isn't configured).
create or replace function public.remove_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_target_role text;
  v_rank jsonb := '{"SUPERADMIN":4,"OWNER":3,"ADMIN":2,"STAFF":1}'::jsonb;
begin
  if auth.uid() = p_target then
    raise exception 'Tidak dapat menghapus akun sendiri';
  end if;

  select role into v_caller_role from public.profiles where id = auth.uid();
  select role into v_target_role from public.profiles where id = p_target;

  if v_caller_role is null or v_target_role is null then
    raise exception 'Pengguna tidak ditemukan';
  end if;

  if coalesce((v_rank->>v_caller_role)::int, 0) <= coalesce((v_rank->>v_target_role)::int, 0) then
    raise exception 'Tidak berwenang menghapus pengguna ini';
  end if;

  delete from public.profiles where id = p_target;
  delete from auth.users where id = p_target;
end;
$$;

revoke all on function public.remove_user(uuid) from public, anon;
grant execute on function public.remove_user(uuid) to authenticated;
