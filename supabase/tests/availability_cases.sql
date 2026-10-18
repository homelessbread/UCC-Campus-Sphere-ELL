-- Designed schedule cases from seed.sql, read through the Phase 3 expansion function. DEVELOPMENT PROJECT ONLY. Read-only.
-- Requires migration 20261015000004_scheduling_engine.sql. Run in the Supabase SQL editor (runs as the owner).
select c.model_object_id as room, o.occ_date, o.start_time, o.end_time, o.subject_code, o.teacher_name
from public.class_occurrences('2026-10-19', '2026-10-26') o
join public.classrooms c on c.id = o.classroom_id
where c.model_object_id in ('L1B2', 'L3B2')
order by c.model_object_id, o.occ_date, o.start_time;
-- Expected: L1B2 meets Mon 2026-10-19 09:00-10:30 but NOT on 2026-10-26 (cancelled);
-- L3B2 meets 08:00-09:30 and 10:30-12:00 on both Mondays, leaving a 60-minute gap at 09:30.
