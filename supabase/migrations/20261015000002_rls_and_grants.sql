-- UCC CampusSphere, Phase 2, migration 2: Row Level Security and grants.
-- Model: browsers (anon and authenticated keys) may only READ. Every write goes through the NestJS backend,
-- which uses the secret key after checking the caller's role. So there are no client write policies at all.

-- Start from nothing, then grant back only what is needed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- Role check used by policies. Lives in a schema that the API does not expose.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = (select auth.uid())
      and r.role = 'admin'
      and p.status = 'active'
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','campuses','buildings','floors','room_categories','equipment_types',
    'classrooms','room_equipment','teachers','subjects','subject_equipment_requirements','academic_terms',
    'class_sections','class_schedules','schedule_exceptions','schedule_cancellations','maintenance_blocks',
    'audit_logs','notifications','model_assets'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference, campus and schedule data: any signed-in, active user can read. Anonymous users get nothing.
create function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active');
$$;
revoke all on function private.is_active_user() from public, anon;
grant execute on function private.is_active_user() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['campuses','buildings','floors','room_categories','equipment_types','classrooms',
    'room_equipment','teachers','subjects','subject_equipment_requirements','academic_terms','class_sections',
    'class_schedules','schedule_exceptions','schedule_cancellations','maintenance_blocks','model_assets'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy "signed-in users read" on public.%I for select to authenticated
      using ((select private.is_active_user()))', t);
  end loop;
end $$;

-- Profiles: read your own, admins read all. Users may edit only their own display name.
-- Status and role cannot be changed by a browser: no UPDATE grant on those columns, and role is in another table.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy "read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy "edit own name" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Roles: read your own, admins read all. Nobody writes from a browser.
grant select on public.user_roles to authenticated;
create policy "read own role" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Audit log: admins only, read only.
grant select on public.audit_logs to authenticated;
create policy "admins read audit log" on public.audit_logs for select to authenticated
  using ((select private.is_admin()));

-- Notifications: yours, or broadcast (user_id is null).
grant select on public.notifications to authenticated;
create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or user_id is null);
