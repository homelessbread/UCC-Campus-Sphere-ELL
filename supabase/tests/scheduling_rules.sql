-- UCC CampusSphere, Phase 3: booking-rule tests. DEVELOPMENT PROJECT ONLY (needs seed.sql and migration 4).
-- Paste into the Supabase SQL editor. Everything runs in one transaction that ends with a deliberate error whose message
-- is the result, so NOTHING is saved. Expected values are listed at the bottom.
create function pg_temp.t(q text) returns text language plpgsql as $f$
begin execute q; return 'ALLOWED'; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;

create function pg_temp.ins(subj text, sec text, room text, emp text, dow int, st text, et text, vf text, vt text)
returns text language plpgsql as $f$
begin
  return pg_temp.t(format($q$insert into public.class_schedules (section_id, classroom_id, teacher_id, day_of_week, start_time, end_time, valid_from, valid_to)
    select s.id, c.id, (select id from public.teachers where employee_no = %L), %s, %L::time, %L::time, %L::date, %L::date
    from public.class_sections s join public.subjects j on j.id = s.subject_id, public.classrooms c
    where j.code = %L and s.section_code = %L and c.model_object_id = %L$q$, emp, dow, st, et, vf, vt, subj, sec, room));
end $f$;

create function pg_temp.exc(subj text, sec text, from_room text, d text, to_room text, st text, et text)
returns text language plpgsql as $f$
begin
  return pg_temp.t(format($q$insert into public.schedule_exceptions (schedule_id, exception_date, classroom_id, start_time, end_time)
    select sc.id, %L::date, (select id from public.classrooms where model_object_id = %L), %L::time, %L::time
    from public.class_schedules sc join public.class_sections s on s.id = sc.section_id join public.subjects j on j.id = s.subject_id
    where j.code = %L and s.section_code = %L and sc.classroom_id = (select id from public.classrooms where model_object_id = %L)
    limit 1$q$, d, to_room, st, et, subj, sec, from_room));
end $f$;

do $$
declare r jsonb := '{}'::jsonb; n int; x text;
begin
  r := r || jsonb_build_object('01_consecutive_back_to_back', pg_temp.ins('DEV-ENG','A','L1B2','DEV-004',1,'10:30','11:30','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('02_room_overlap_by_1_minute', pg_temp.ins('DEV-PHYS','A','L1B2','DEV-005',1,'10:29','10:45','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('03_teacher_double_booked', pg_temp.ins('DEV-PHYS','A','R2F1','DEV-002',1,'09:00','10:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('04_inactive_room', pg_temp.ins('DEV-PHYS','A','L4B1','DEV-005',3,'08:00','09:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('05_capacity_below_enrollment', pg_temp.ins('DEV-MATH','B','R2F1','DEV-005',3,'08:00','09:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('06_wrong_room_type', pg_temp.ins('DEV-PROG1','A','L1B2','DEV-004',3,'08:00','09:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('07_lab_with_enough_equipment', pg_temp.ins('DEV-CHEM','A','L2B1','DEV-005',3,'08:00','10:00','2026-08-17','2026-12-19'));
  update public.room_equipment set quantity = 5
   where classroom_id = (select id from public.classrooms where model_object_id = 'L2B1')
     and equipment_type_id = (select id from public.equipment_types where code = 'lab_bench');
  r := r || jsonb_build_object('08_missing_equipment', pg_temp.ins('DEV-CHEM','A','L2B1','DEV-005',4,'08:00','10:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('09_outside_term', pg_temp.ins('DEV-PHYS','A','R2F1','DEV-005',5,'08:00','09:00','2026-08-17','2027-01-10'));
  update public.teachers set is_active = false where employee_no = 'DEV-003';
  r := r || jsonb_build_object('10_inactive_teacher', pg_temp.ins('DEV-PHYS','A','R2F1','DEV-003',5,'08:00','09:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('11_during_maintenance', pg_temp.ins('DEV-MATH','A','R4F2','DEV-005',1,'09:00','10:00','2026-10-19','2026-10-19'));
  r := r || jsonb_build_object('12_right_after_maintenance', pg_temp.ins('DEV-MATH','A','R4F2','DEV-005',1,'12:00','13:00','2026-10-19','2026-10-19'));
  select count(*) into n from public.class_occurrences('2026-10-19','2026-10-19') o join public.classrooms c on c.id=o.classroom_id where c.model_object_id='L1B2' and o.start_time='09:00';
  r := r || jsonb_build_object('13_room107_meets_2026_10_19', n);
  select count(*) into n from public.class_occurrences('2026-10-26','2026-10-26') o join public.classrooms c on c.id=o.classroom_id where c.model_object_id='L1B2' and o.start_time='09:00';
  r := r || jsonb_build_object('14_room107_cancelled_2026_10_26', n);
  select to_char(o.starts_at at time zone 'UTC','YYYY-MM-DD HH24:MI') into x from public.class_occurrences('2026-10-19','2026-10-19') o join public.classrooms c on c.id=o.classroom_id where c.model_object_id='L1B2' and o.start_time='09:00';
  r := r || jsonb_build_object('15_9am_manila_in_utc', x);
  r := r || jsonb_build_object('16_exception_into_busy_room', pg_temp.exc('DEV-ENG','A','L3B2','2026-10-19','L1B2','10:00','11:00'));
  r := r || jsonb_build_object('17_exception_ending_when_class_starts', pg_temp.exc('DEV-ENG','A','L3B2','2026-10-19','L1B2','08:00','09:00'));
  r := r || jsonb_build_object('18_exception_into_maintenance', pg_temp.exc('DEV-ENG','A','L3B2','2026-10-19','R4F2','08:00','09:30'));
  r := r || jsonb_build_object('19_exception_on_non_meeting_day', pg_temp.exc('DEV-ENG','A','L3B2','2026-10-20','R2F1',null,null));
  r := r || jsonb_build_object('20_teacher_extra_class', pg_temp.ins('DEV-PHYS','A','R2F1','DEV-002',1,'14:00','15:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('21_exception_double_books_teacher', pg_temp.exc('DEV-ENG','A','L3B2','2026-10-19','L3B2','14:30','15:30'));
  r := r || jsonb_build_object('22_exception_to_free_room', pg_temp.exc('DEV-ENG','A','L3B2','2026-10-19','R2F1',null,null));
  r := r || jsonb_build_object('23_weekly_class_vs_that_exception', pg_temp.ins('DEV-PHYS','A','R2F1','DEV-005',1,'08:30','09:00','2026-08-17','2026-12-19'));
  r := r || jsonb_build_object('24_enrollment_exceeds_room', pg_temp.t($q$update public.class_sections set enrollment = 60 where id = (select s.id from public.class_sections s join public.subjects j on j.id=s.subject_id where j.code='DEV-MATH' and s.section_code='A')$q$));
  insert into public.non_instructional_days (day, name) values ('2026-10-19','TEST HOLIDAY');
  select count(*) into n from public.class_occurrences('2026-10-19','2026-10-19');
  r := r || jsonb_build_object('25_classes_on_holiday', n);
  raise exception 'RESULT %', jsonb_pretty(r);
end $$;
-- Expected: 01 ALLOWED; 02,03 23P01 (exclusion); 04 UC001; 05 UC003; 06 UC004; 07 ALLOWED; 08 UC005; 09 UC006; 10 UC010;
-- 11 UC002; 12 ALLOWED; 13 = 1; 14 = 0; 15 = 2026-10-19 01:00; 16 UC008; 17 ALLOWED; 18 UC002; 19 UC011; 20 ALLOWED;
-- 21 UC008 (teacher); 22 ALLOWED; 23 UC008; 24 UC003; 25 = 0.
-- NOTE: do not run it twice in the same session while other tests hold locks; it is safe to re-run, nothing is saved.
