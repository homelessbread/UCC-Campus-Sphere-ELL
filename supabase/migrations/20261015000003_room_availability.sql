-- UCC CampusSphere, Phase 2, migration 3: basic room availability.
-- Status of every classroom at one instant. Times are read in Asia/Manila.
-- Handles: weekly schedules, term/date validity, cancellations, maintenance blocks, inactive rooms.
-- NOT handled yet (Phase 3): one-date schedule_exceptions, capacity and equipment filters, recurrence edge cases.
-- Only the backend (secret key) may call it.

create function public.room_availability(p_at timestamptz default now(), p_horizon_minutes integer default 180)
returns table (classroom_id uuid, status text, free_minutes integer, next_change_at timestamptz)
language sql stable set search_path = '' as $$
  with nn as (
    select (p_at at time zone 'Asia/Manila') as lt
  ), now_local as (
    select lt::date as d,
           extract(isodow from lt)::int as dow,
           (extract(hour from lt) * 60 + extract(minute from lt))::int as m
    from nn
  ), todays as (
    select s.classroom_id, lower(s.time_slot) as s_min, upper(s.time_slot) as e_min
    from public.class_schedules s, now_local l
    where s.status = 'active'
      and s.day_of_week = l.dow
      and s.valid_during @> l.d
      and not exists (
        select 1 from public.schedule_cancellations x where x.schedule_id = s.id and x.cancel_date = l.d)
  ), base as (
    select c.id, c.status as room_status, l.d, l.m, oc.e_min, nx.s_min, mb.cur_end, mb.next_start
    from public.classrooms c
    cross join now_local l
    left join lateral (
      select max(t.e_min) as e_min from todays t
      where t.classroom_id = c.id and t.s_min <= l.m and l.m < t.e_min) oc on true
    left join lateral (
      select min(t.s_min) as s_min from todays t
      where t.classroom_id = c.id and t.s_min > l.m) nx on true
    left join lateral (
      select max(b.ends_at)   filter (where b.starts_at <= p_at and b.ends_at > p_at) as cur_end,
             min(b.starts_at) filter (where b.starts_at > p_at) as next_start
      from public.maintenance_blocks b
      where b.classroom_id = c.id and b.ends_at > p_at) mb on true
  )
  select b.id,
    case when b.room_status <> 'active' then 'inactive'
         when b.cur_end is not null then 'maintenance'
         when b.e_min is not null then 'occupied'
         else 'free' end,
    case when b.room_status <> 'active' or b.cur_end is not null or b.e_min is not null then 0
         else least(
           p_horizon_minutes,
           b.s_min - b.m,
           ceil(extract(epoch from (b.next_start - p_at)) / 60)::int) end,
    case when b.room_status <> 'active' then null
         when b.cur_end is not null then b.cur_end
         when b.e_min is not null then (b.d + make_interval(mins => b.e_min)) at time zone 'Asia/Manila'
         else least(
           case when b.s_min is not null then (b.d + make_interval(mins => b.s_min)) at time zone 'Asia/Manila' end,
           b.next_start) end
  from base b;
$$;

revoke all on function public.room_availability(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.room_availability(timestamptz, integer) to service_role;
