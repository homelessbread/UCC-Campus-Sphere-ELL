-- UCC CampusSphere, Phase 2, migration 1: core schema.
-- Every table lives in `public`. Row Level Security is enabled in migration 2.
-- Primary keys are uuids. Structure tables use ON DELETE RESTRICT so a delete cannot silently wipe records.

create extension if not exists btree_gist with schema extensions;
create schema if not exists private;

create type public.app_role       as enum ('admin', 'user');
create type public.user_status    as enum ('active', 'suspended');
create type public.room_status    as enum ('active', 'inactive');
create type public.schedule_status as enum ('active', 'archived');

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Identity and roles ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  status     public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one role per user. Only the backend (secret key) may write this table.
create table public.user_roles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       public.app_role not null default 'user',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- Every new Supabase Auth user gets a profile and the `user` role. The role never comes from client metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Campus structure ----------
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete restrict,
  code text not null,
  name text not null,
  model_object_id text,            -- name of the 3D object for this building
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, code)
);

create table public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete restrict,
  level smallint not null,
  name text not null,
  model_object_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, level)
);

create table public.room_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

create table public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

-- A classroom reaches its building through its floor, so building is not stored twice.
create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors (id) on delete restrict,
  category_id uuid not null references public.room_categories (id) on delete restrict,
  code text,                       -- printed room number, null where the plans show none
  name text not null,
  capacity integer not null check (capacity > 0),
  status public.room_status not null default 'active',
  model_object_id text unique,     -- stable id used by the 3D model, for example L1B2
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_id, code)
);
create index classrooms_floor_idx on public.classrooms (floor_id);
create index classrooms_category_idx on public.classrooms (category_id);

create table public.room_equipment (
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types (id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  primary key (classroom_id, equipment_type_id)
);
create index room_equipment_equipment_idx on public.room_equipment (equipment_type_id);

-- ---------- Academic records ----------
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  employee_no text unique,
  full_name text not null,
  email text,
  user_id uuid unique references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  units numeric(3,1) not null default 3 check (units >= 0),
  required_category_id uuid references public.room_categories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subjects_category_idx on public.subjects (required_category_id);

create table public.subject_equipment_requirements (
  subject_id uuid not null references public.subjects (id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types (id) on delete restrict,
  min_quantity integer not null default 1 check (min_quantity > 0),
  primary key (subject_id, equipment_type_id)
);
create index subject_equipment_equipment_idx on public.subject_equipment_requirements (equipment_type_id);

create table public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date),
  exclude using gist (daterange(start_date, end_date, '[]') with &&)
);
create unique index academic_terms_one_current on public.academic_terms (is_current) where is_current;

create table public.class_sections (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.academic_terms (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  section_code text not null,
  enrollment integer not null default 0 check (enrollment >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term_id, subject_id, section_code)
);
create index class_sections_subject_idx on public.class_sections (subject_id);

-- One row is a weekly recurring meeting (ISO weekday 1=Mon..7=Sun), local school time (Asia/Manila).
create table public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.class_sections (id) on delete cascade,
  classroom_id uuid not null references public.classrooms (id) on delete restrict,
  teacher_id uuid references public.teachers (id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  valid_from date not null,
  valid_to date not null,
  status public.schedule_status not null default 'active',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Derived ranges used only by the overlap safeguards below.
  time_slot int4range generated always as (
    int4range(
      (extract(hour from start_time) * 60 + extract(minute from start_time))::int,
      (extract(hour from end_time) * 60 + extract(minute from end_time))::int)
  ) stored,
  valid_during daterange generated always as (daterange(valid_from, valid_to, '[]')) stored,
  check (end_time > start_time),
  check (valid_to >= valid_from),
  -- Database-level safeguards: no two active meetings may share a room, or a teacher, at overlapping times.
  constraint class_schedules_no_room_overlap exclude using gist (
    classroom_id with =, day_of_week with =, valid_during with &&, time_slot with &&
  ) where (status = 'active'),
  constraint class_schedules_no_teacher_overlap exclude using gist (
    teacher_id with =, day_of_week with =, valid_during with &&, time_slot with &&
  ) where (status = 'active' and teacher_id is not null)
);
create index class_schedules_section_idx on public.class_schedules (section_id);
create index class_schedules_room_day_idx on public.class_schedules (classroom_id, day_of_week);
create index class_schedules_teacher_idx on public.class_schedules (teacher_id);

-- A one-date change to a recurring meeting (another room and/or other times).
create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.class_schedules (id) on delete cascade,
  exception_date date not null,
  classroom_id uuid references public.classrooms (id) on delete restrict,
  start_time time,
  end_time time,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (schedule_id, exception_date),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time)
);
create index schedule_exceptions_room_idx on public.schedule_exceptions (classroom_id);

-- A single date on which a recurring meeting does not happen.
create table public.schedule_cancellations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.class_schedules (id) on delete cascade,
  cancel_date date not null,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (schedule_id, cancel_date)
);

create table public.maintenance_blocks (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  exclude using gist (classroom_id with =, tstzrange(starts_at, ends_at) with &&)
);

-- ---------- Operational records ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,  -- null means everyone
  kind text not null,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.model_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  building_id uuid references public.buildings (id) on delete set null,
  storage_path text,
  notes text,
  created_at timestamptz not null default now(),
  unique (name, version)
);
create index model_assets_building_idx on public.model_assets (building_id);

-- updated_at maintenance
do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','campuses','buildings','floors','classrooms','teachers',
    'subjects','academic_terms','class_sections','class_schedules','maintenance_blocks'] loop
    execute format('create trigger set_updated_at before update on public.%I
      for each row execute function private.set_updated_at()', t);
  end loop;
end $$;
