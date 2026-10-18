-- Phase 4: dry-run check for a weekly schedule. Mirrors the save-time rules but never writes,
-- so the admin form can show every problem before the user presses Save.
-- Returns zero rows when the schedule would be accepted.

create or replace function public.check_class_schedule(
  p_section uuid, p_classroom uuid, p_teacher uuid, p_day int,
  p_start time, p_end time, p_from date, p_to date, p_exclude uuid default null)
returns table (severity text, code text, message text, related_schedule_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  sec public.class_sections; term public.academic_terms; tch public.teachers;
  msg text; hit record; rng daterange;
begin
  if p_end <= p_start then
    return query select 'error', 'UC009', 'The end time must be later than the start time.', null::uuid;
    return;
  end if;
  if p_to < p_from then
    return query select 'error', 'UC009', 'The end date must not be before the start date.', null::uuid;
    return;
  end if;
  rng := daterange(p_from, p_to, '[]');

  select * into sec from public.class_sections where id = p_section;
  if not found then
    return query select 'error', 'UC009', 'That section does not exist.', null::uuid;
    return;
  end if;
  select * into term from public.academic_terms where id = sec.term_id;
  if p_from < term.start_date or p_to > term.end_date then
    return query select 'error', 'UC006',
      format('The schedule must stay inside %s (%s to %s).', term.name, term.start_date, term.end_date), null::uuid;
  end if;

  begin
    perform private.check_room_fit(p_classroom, p_section);
  exception when others then
    return query select 'error', sqlstate::text, sqlerrm, null::uuid;
  end;

  if p_teacher is null then
    return query select 'warning', 'W002', 'No teacher is assigned yet.', null::uuid;
  else
    select * into tch from public.teachers where id = p_teacher;
    if not found or not tch.is_active then
      return query select 'error', 'UC010',
        format('%s is not an active teacher.', coalesce(tch.full_name, 'That teacher')), null::uuid;
    end if;
  end if;

  msg := private.maintenance_conflict(p_classroom, p_from, p_to, p_day, p_start, p_end);
  if msg is not null then
    return query select 'error', 'UC002', msg, null::uuid;
  end if;

  -- Room clash with another weekly schedule
  for hit in
    select s.id, sub.code as sc, sec2.section_code as sn, s.start_time as a, s.end_time as b
    from public.class_schedules s
    join public.class_sections sec2 on sec2.id = s.section_id
    join public.subjects sub on sub.id = sec2.subject_id
    where s.status = 'active' and s.id is distinct from p_exclude
      and s.classroom_id = p_classroom and s.day_of_week = p_day
      and s.valid_during && rng and (s.start_time, s.end_time) overlaps (p_start, p_end)
  loop
    return query select 'error', '23P01',
      format('The room is already used by %s %s from %s to %s on the same weekday.',
             hit.sc, hit.sn, to_char(hit.a, 'HH24:MI'), to_char(hit.b, 'HH24:MI')), hit.id;
  end loop;

  -- Teacher clash
  if p_teacher is not null then
    for hit in
      select s.id, sub.code as sc, sec2.section_code as sn, s.start_time as a, s.end_time as b
      from public.class_schedules s
      join public.class_sections sec2 on sec2.id = s.section_id
      join public.subjects sub on sub.id = sec2.subject_id
      where s.status = 'active' and s.id is distinct from p_exclude
        and s.teacher_id = p_teacher and s.day_of_week = p_day
        and s.valid_during && rng and (s.start_time, s.end_time) overlaps (p_start, p_end)
    loop
      return query select 'error', '23P01',
        format('The teacher already teaches %s %s from %s to %s on the same weekday.',
               hit.sc, hit.sn, to_char(hit.a, 'HH24:MI'), to_char(hit.b, 'HH24:MI')), hit.id;
    end loop;
  end if;

  -- Same section scheduled twice at overlapping times (allowed, but unusual)
  for hit in
    select s.id, s.start_time as a, s.end_time as b
    from public.class_schedules s
    where s.status = 'active' and s.id is distinct from p_exclude
      and s.section_id = p_section and s.day_of_week = p_day
      and s.valid_during && rng and (s.start_time, s.end_time) overlaps (p_start, p_end)
  loop
    return query select 'warning', 'W001',
      format('This section already meets from %s to %s on the same weekday.',
             to_char(hit.a, 'HH24:MI'), to_char(hit.b, 'HH24:MI')), hit.id;
  end loop;

  -- One-date changes that land in this room or on this teacher
  select e.exception_date as d, sub.code as sc, sec2.section_code as sn into hit
  from public.schedule_exceptions e
  join public.class_schedules s2 on s2.id = e.schedule_id and s2.status = 'active' and s2.id is distinct from p_exclude
  join public.class_sections sec2 on sec2.id = s2.section_id
  join public.subjects sub on sub.id = sec2.subject_id
  where coalesce(e.classroom_id, s2.classroom_id) = p_classroom
    and e.exception_date <@ rng
    and extract(isodow from e.exception_date)::int = p_day
    and (coalesce(e.start_time, s2.start_time), coalesce(e.end_time, s2.end_time)) overlaps (p_start, p_end)
  limit 1;
  if found then
    return query select 'error', 'UC008',
      format('This room is used on %s by %s %s through a one-date change.', hit.d, hit.sc, hit.sn), null::uuid;
  end if;
end $$;

revoke all on function public.check_class_schedule(uuid, uuid, uuid, int, time, time, date, date, uuid) from public, anon, authenticated;
grant execute on function public.check_class_schedule(uuid, uuid, uuid, int, time, time, date, date, uuid) to service_role;
