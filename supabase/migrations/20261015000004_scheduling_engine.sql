-- UCC CampusSphere, Phase 3, migration 4: scheduling rules and recurring-schedule expansion.
--
-- Time model (the same everywhere): class meetings store LOCAL school time (Asia/Manila) as an ISO weekday plus
-- start/end `time` and a local date range. Maintenance blocks store absolute instants (timestamptz).
-- Manila has no daylight saving, but every conversion is written with `at time zone 'Asia/Manila'` anyway.
--
-- One authority for "what actually happens on a date": public.class_occurrences(). It applies the weekly rule,
-- the date range, non-instructional days, cancellations and one-date exceptions. Both the validation triggers
-- below and the API's availability service read it, so they can never disagree.
--
-- Custom error codes (SQLSTATE) raised by the rules; the API turns them into HTTP 409 or 422:
--   UC001 room inactive          UC002 room under maintenance     UC003 capacity below enrollment
--   UC004 wrong room type        UC005 missing equipment          UC006 outside the academic term
--   UC008 conflicts with a one-date change or another class       UC009 invalid input
--   UC010 teacher inactive       UC011 invalid exception date

-- ---------- Holidays and other non-instructional days ----------
create table public.non_instructional_days (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index non_instructional_days_created_by_idx on public.non_instructional_days (created_by);
alter table public.non_instructional_days enable row level security;
grant select on public.non_instructional_days to authenticated;
create policy "signed-in users read" on public.non_instructional_days for select to authenticated
  using ((select private.is_active_user()));

-- ---------- Occurrence expansion ----------
-- Phase 2's basic function is replaced so there is only one availability authority.
drop function if exists public.room_availability(timestamptz, integer);

create function public.class_occurrences(p_from date, p_to date)
returns table (
  schedule_id uuid, section_id uuid, classroom_id uuid, teacher_id uuid, occ_date date,
  start_time time, end_time time, starts_at timestamptz, ends_at timestamptz, is_moved boolean,
  subject_code text, section_code text, teacher_name text)
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
begin
  if p_to < p_from then
    raise exception using errcode = 'UC009', message = 'The end date must not be before the start date.';
  end if;
  if p_to - p_from > 62 then
    raise exception using errcode = 'UC009', message = 'The date range is limited to 63 days.';
  end if;
  return query
  select s.id, s.section_id, coalesce(e.classroom_id, s.classroom_id), s.teacher_id, d.d,
         coalesce(e.start_time, s.start_time), coalesce(e.end_time, s.end_time),
         (d.d + coalesce(e.start_time, s.start_time)) at time zone 'Asia/Manila',
         (d.d + coalesce(e.end_time, s.end_time)) at time zone 'Asia/Manila',
         (e.id is not null), sub.code, sec.section_code, t.full_name
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g(ts)
  cross join lateral (select g.ts::date as d) d
  join public.class_schedules s
    on s.status = 'active' and s.day_of_week = extract(isodow from d.d)::int and s.valid_during @> d.d
  join public.class_sections sec on sec.id = s.section_id
  join public.subjects sub on sub.id = sec.subject_id
  left join public.teachers t on t.id = s.teacher_id
  left join public.schedule_exceptions e on e.schedule_id = s.id and e.exception_date = d.d
  where not exists (select 1 from public.non_instructional_days h where h.day = d.d)
    and not exists (select 1 from public.schedule_cancellations c where c.schedule_id = s.id and c.cancel_date = d.d);
end $$;
revoke all on function public.class_occurrences(date, date) from public, anon, authenticated;
grant execute on function public.class_occurrences(date, date) to service_role;

-- ---------- Rule helpers (SECURITY DEFINER so they work for any caller; never exposed to the API) ----------
create function private.check_room_fit(p_room uuid, p_section uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare r public.classrooms; sec public.class_sections; subj public.subjects;
        cat_have text; cat_need text; missing text;
begin
  select * into r from public.classrooms where id = p_room;
  if not found then raise exception using errcode = 'UC009', message = 'That classroom does not exist.'; end if;
  if r.status <> 'active' then
    raise exception using errcode = 'UC001', message = format('%s is inactive and cannot be assigned classes.', r.name);
  end if;
  select * into sec from public.class_sections where id = p_section;
  select * into subj from public.subjects where id = sec.subject_id;
  if sec.enrollment > r.capacity then
    raise exception using errcode = 'UC003',
      message = format('%s seats %s but section %s has %s students.', r.name, r.capacity, sec.section_code, sec.enrollment);
  end if;
  if subj.required_category_id is not null and subj.required_category_id <> r.category_id then
    select name into cat_need from public.room_categories where id = subj.required_category_id;
    select name into cat_have from public.room_categories where id = r.category_id;
    raise exception using errcode = 'UC004',
      message = format('%s needs a %s, but %s is a %s.', subj.code, cat_need, r.name, cat_have);
  end if;
  select string_agg(format('%s (needs %s, has %s)', et.name, q.min_quantity, coalesce(re.quantity, 0)), ', ')
    into missing
  from public.subject_equipment_requirements q
  join public.equipment_types et on et.id = q.equipment_type_id
  left join public.room_equipment re on re.classroom_id = p_room and re.equipment_type_id = q.equipment_type_id
  where q.subject_id = subj.id and coalesce(re.quantity, 0) < q.min_quantity;
  if missing is not null then
    raise exception using errcode = 'UC005', message = format('%s lacks equipment required by %s: %s.', r.name, subj.code, missing);
  end if;
end $$;

-- Returns a sentence describing the first maintenance block that a weekly meeting would run into, or null.
create function private.maintenance_conflict(p_room uuid, p_from date, p_to date, p_dow int, p_start time, p_end time)
returns text language sql stable security definer set search_path = '' as $$
  select format('%s is under maintenance on %s (%s to %s local time)%s.',
           (select name from public.classrooms where id = p_room),
           to_char(g.ts, 'YYYY-MM-DD'),
           to_char(m.starts_at at time zone 'Asia/Manila', 'HH24:MI'),
           to_char(m.ends_at at time zone 'Asia/Manila', 'HH24:MI'),
           coalesce(': ' || m.reason, ''))
  from public.maintenance_blocks m
  cross join lateral generate_series(
    greatest(p_from, (m.starts_at at time zone 'Asia/Manila')::date)::timestamp,
    least(p_to, (m.ends_at at time zone 'Asia/Manila')::date)::timestamp,
    interval '1 day') g(ts)
  where m.classroom_id = p_room
    and extract(isodow from g.ts)::int = p_dow
    and tstzrange(m.starts_at, m.ends_at) &&
        tstzrange((g.ts::date + p_start) at time zone 'Asia/Manila', (g.ts::date + p_end) at time zone 'Asia/Manila')
  order by g.ts
  limit 1;
$$;

create function private.lock_room_and_teacher(p_room uuid, p_teacher uuid) returns void
language plpgsql set search_path = '' as $$
begin
  -- Always room first, then teacher, so two requests can never wait on each other in a circle.
  perform pg_advisory_xact_lock(hashtextextended('room:' || p_room::text, 0));
  if p_teacher is not null then
    perform pg_advisory_xact_lock(hashtextextended('teacher:' || p_teacher::text, 0));
  end if;
end $$;

-- ---------- Rules for a weekly schedule ----------
create function private.validate_class_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sec public.class_sections; term public.academic_terms; tch public.teachers; msg text; hit record;
begin
  if new.status <> 'active' then return new; end if;
  perform private.lock_room_and_teacher(new.classroom_id, new.teacher_id);

  select * into sec from public.class_sections where id = new.section_id;
  select * into term from public.academic_terms where id = sec.term_id;
  if new.valid_from < term.start_date or new.valid_to > term.end_date then
    raise exception using errcode = 'UC006',
      message = format('The schedule must stay inside %s (%s to %s).', term.name, term.start_date, term.end_date);
  end if;

  perform private.check_room_fit(new.classroom_id, new.section_id);

  if new.teacher_id is not null then
    select * into tch from public.teachers where id = new.teacher_id;
    if not tch.is_active then
      raise exception using errcode = 'UC010', message = format('%s is not an active teacher.', tch.full_name);
    end if;
  end if;

  msg := private.maintenance_conflict(new.classroom_id, new.valid_from, new.valid_to, new.day_of_week, new.start_time, new.end_time);
  if msg is not null then raise exception using errcode = 'UC002', message = msg; end if;

  -- One-date changes of OTHER classes that land in this room (or on this teacher) at an overlapping time.
  select e.exception_date, sub.code as code, sec2.section_code as sc into hit
  from public.schedule_exceptions e
  join public.class_schedules s2 on s2.id = e.schedule_id and s2.status = 'active' and s2.id <> new.id
  join public.class_sections sec2 on sec2.id = s2.section_id
  join public.subjects sub on sub.id = sec2.subject_id
  where coalesce(e.classroom_id, s2.classroom_id) = new.classroom_id
    and e.exception_date <@ daterange(new.valid_from, new.valid_to, '[]')
    and extract(isodow from e.exception_date)::int = new.day_of_week
    and (coalesce(e.start_time, s2.start_time), coalesce(e.end_time, s2.end_time)) overlaps (new.start_time, new.end_time)
  limit 1;
  if found then
    raise exception using errcode = 'UC008',
      message = format('This room is used on %s by %s %s through a one-date change.', hit.exception_date, hit.code, hit.sc);
  end if;
  if new.teacher_id is not null then
    select e.exception_date, sub.code as code, sec2.section_code as sc into hit
    from public.schedule_exceptions e
    join public.class_schedules s2 on s2.id = e.schedule_id and s2.status = 'active' and s2.id <> new.id
    join public.class_sections sec2 on sec2.id = s2.section_id
    join public.subjects sub on sub.id = sec2.subject_id
    where s2.teacher_id = new.teacher_id
      and e.exception_date <@ daterange(new.valid_from, new.valid_to, '[]')
      and extract(isodow from e.exception_date)::int = new.day_of_week
      and (coalesce(e.start_time, s2.start_time), coalesce(e.end_time, s2.end_time)) overlaps (new.start_time, new.end_time)
    limit 1;
    if found then
      raise exception using errcode = 'UC008',
        message = format('This teacher already teaches %s %s on %s through a one-date change.', hit.code, hit.sc, hit.exception_date);
    end if;
  end if;
  return new;
end $$;

create trigger validate_class_schedule before insert or update on public.class_schedules
  for each row execute function private.validate_class_schedule();

-- ---------- Rules for a one-date exception ----------
create function private.validate_schedule_exception() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.class_schedules; room uuid; st time; et time; hit record; msg text;
begin
  select * into s from public.class_schedules where id = new.schedule_id;
  if s.status <> 'active' then
    raise exception using errcode = 'UC011', message = 'That schedule is archived.';
  end if;
  if not (new.exception_date <@ s.valid_during) or extract(isodow from new.exception_date)::int <> s.day_of_week then
    raise exception using errcode = 'UC011', message = format('%s is not a date on which this class meets.', new.exception_date);
  end if;
  if exists (select 1 from public.non_instructional_days h where h.day = new.exception_date) then
    raise exception using errcode = 'UC011', message = format('%s is a non-instructional day.', new.exception_date);
  end if;
  if exists (select 1 from public.schedule_cancellations c where c.schedule_id = s.id and c.cancel_date = new.exception_date) then
    raise exception using errcode = 'UC011', message = format('This class is cancelled on %s.', new.exception_date);
  end if;

  room := coalesce(new.classroom_id, s.classroom_id);
  st := coalesce(new.start_time, s.start_time);
  et := coalesce(new.end_time, s.end_time);
  if et <= st then raise exception using errcode = 'UC009', message = 'The end time must be later than the start time.'; end if;

  perform private.lock_room_and_teacher(room, s.teacher_id);
  perform private.check_room_fit(room, s.section_id);

  msg := private.maintenance_conflict(room, new.exception_date, new.exception_date, s.day_of_week, st, et);
  if msg is not null then raise exception using errcode = 'UC002', message = msg; end if;

  select o.subject_code, o.section_code, o.start_time as a, o.end_time as b into hit
  from public.class_occurrences(new.exception_date, new.exception_date) o
  where o.schedule_id <> s.id and o.classroom_id = room and (o.start_time, o.end_time) overlaps (st, et)
  limit 1;
  if found then
    raise exception using errcode = 'UC008',
      message = format('The room is already used by %s %s from %s to %s on %s.',
                       hit.subject_code, hit.section_code, to_char(hit.a, 'HH24:MI'), to_char(hit.b, 'HH24:MI'), new.exception_date);
  end if;
  if s.teacher_id is not null then
    select o.subject_code, o.section_code, o.start_time as a, o.end_time as b into hit
    from public.class_occurrences(new.exception_date, new.exception_date) o
    where o.schedule_id <> s.id and o.teacher_id = s.teacher_id and (o.start_time, o.end_time) overlaps (st, et)
    limit 1;
    if found then
      raise exception using errcode = 'UC008',
        message = format('The teacher already teaches %s %s from %s to %s on %s.',
                         hit.subject_code, hit.section_code, to_char(hit.a, 'HH24:MI'), to_char(hit.b, 'HH24:MI'), new.exception_date);
    end if;
  end if;
  return new;
end $$;

create trigger validate_schedule_exception before insert or update on public.schedule_exceptions
  for each row execute function private.validate_schedule_exception();

-- ---------- Enrollment or subject changes must still fit the rooms already assigned ----------
create function private.revalidate_section() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sch record;
begin
  for sch in select classroom_id from public.class_schedules where section_id = new.id and status = 'active' loop
    perform private.check_room_fit(sch.classroom_id, new.id);
  end loop;
  return new;
end $$;

create trigger revalidate_section after update of enrollment, subject_id on public.class_sections
  for each row execute function private.revalidate_section();
