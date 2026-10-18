-- =====================================================================================
-- DEVELOPMENT SAMPLE DATA ONLY. Everything here is fictional. NEVER run this on production.
-- It is not run by the application. Apply it by hand to the development project only.
-- Safe to re-run: existing rows are skipped.
-- Real UCC data (rooms taken from the 3D model) comes later through the admin dashboard.
-- =====================================================================================

insert into public.campuses (code, name) values ('UCC-MAIN', 'University of Caloocan City (DEV sample)')
on conflict (code) do nothing;

insert into public.buildings (campus_id, code, name, model_object_id)
select c.id, v.code, v.name, v.model_id from public.campuses c,
  (values ('CONG-L','Congress Building, Left Wing','L'), ('CONG-R','Congress Building, Right Wing','R')) as v(code,name,model_id)
where c.code = 'UCC-MAIN' on conflict (campus_id, code) do nothing;

insert into public.floors (building_id, level, name, model_object_id)
select b.id, f.level, f.level || case f.level when 1 then 'st' when 2 then 'nd' when 3 then 'rd' else 'th' end || ' floor',
       b.model_object_id || f.level
from public.buildings b cross join (values (1),(2),(3),(4)) as f(level)
on conflict (building_id, level) do nothing;

insert into public.room_categories (code, name) values
  ('regular','Regular classroom'), ('lecture','Lecture room'), ('lab','Laboratory'), ('comlab','Computer laboratory')
on conflict (code) do nothing;

insert into public.equipment_types (code, name) values
  ('projector','Projector'), ('whiteboard','Whiteboard'), ('aircon','Air conditioning'),
  ('computers','Computer stations'), ('lab_bench','Laboratory benches')
on conflict (code) do nothing;

-- model_object_id values match the room ids in the 3D prototype (wing, floor, back/front, slot).
with rooms(model_id, bcode, lvl, code, name, cap, cat, st) as (values
  ('L1B2','CONG-L',1,'107','Regular Room (107)',40,'regular','active'),
  ('L2B1','CONG-L',2,'208','Chemistry Laboratory (208)',30,'lab','active'),
  ('L2B3','CONG-L',2,'206','Lecture (206)',80,'lecture','active'),
  ('L3B2','CONG-L',3,'307','Regular Room (307)',45,'regular','active'),
  ('L3B3','CONG-L',3,'306','Regular Room (306)',35,'regular','active'),
  ('L4B1','CONG-L',4,'408','Regular Room (408)',40,'regular','inactive'),
  ('R2F1','CONG-R',2,'201','Regular Room (201)',35,'regular','active'),
  ('R2F2','CONG-R',2,'202','Regular Room (202)',50,'regular','active'),
  ('R3F1','CONG-R',3,'301','CSD COMLAB (301)',30,'comlab','active'),
  ('R3F2','CONG-R',3,'302','CSD COMLAB (302)',25,'comlab','active'),
  ('R4F1','CONG-R',4,'401','Regular Room (401)',40,'regular','active'),
  ('R4F2','CONG-R',4,'402','Regular Room (402)',40,'regular','active'),
  ('R4B2','CONG-R',4,'404','Regular Room (404)',40,'regular','active'))
insert into public.classrooms (floor_id, category_id, code, name, capacity, status, model_object_id)
select f.id, k.id, r.code, r.name, r.cap, r.st::public.room_status, r.model_id
from rooms r
join public.buildings b on b.code = r.bcode
join public.floors f on f.building_id = b.id and f.level = r.lvl
join public.room_categories k on k.code = r.cat
on conflict (model_object_id) do nothing;

with eq(model_id, ecode, qty) as (values
  ('L1B2','whiteboard',1), ('L1B2','projector',1),
  ('L2B1','lab_bench',10), ('L2B1','whiteboard',1),
  ('L2B3','projector',1), ('L2B3','aircon',2), ('L2B3','whiteboard',1),
  ('L3B2','whiteboard',1),
  ('L3B3','whiteboard',1), ('L3B3','projector',1),
  ('R2F1','whiteboard',1),
  ('R2F2','projector',1), ('R2F2','aircon',1), ('R2F2','whiteboard',1),
  ('R3F1','computers',30), ('R3F1','aircon',2),
  ('R3F2','computers',25),
  ('R4F1','whiteboard',1), ('R4F2','whiteboard',1), ('R4B2','whiteboard',1))
insert into public.room_equipment (classroom_id, equipment_type_id, quantity)
select c.id, t.id, e.qty from eq e
join public.classrooms c on c.model_object_id = e.model_id
join public.equipment_types t on t.code = e.ecode
on conflict do nothing;

insert into public.teachers (employee_no, full_name, email) values
  ('DEV-001','Sample Teacher One','dev-t1@example.invalid'),
  ('DEV-002','Sample Teacher Two','dev-t2@example.invalid'),
  ('DEV-003','Sample Teacher Three','dev-t3@example.invalid'),
  ('DEV-004','Sample Teacher Four','dev-t4@example.invalid'),
  ('DEV-005','Sample Teacher Five','dev-t5@example.invalid')
on conflict (employee_no) do nothing;

insert into public.subjects (code, title, units, required_category_id)
select v.code, v.title, v.units, (select id from public.room_categories where code = v.cat)
from (values
  ('DEV-PROG1','Intro to Programming (sample)', 3.0, 'comlab'),
  ('DEV-CHEM','General Chemistry (sample)', 4.0, 'lab'),
  ('DEV-MATH','Calculus (sample)', 3.0, null),
  ('DEV-ENG','Technical Writing (sample)', 3.0, null),
  ('DEV-PHYS','Physics Concepts (sample)', 3.0, null)) as v(code,title,units,cat)
on conflict (code) do nothing;

insert into public.subject_equipment_requirements (subject_id, equipment_type_id, min_quantity)
select s.id, e.id, v.q from (values ('DEV-PROG1','computers',25), ('DEV-CHEM','lab_bench',8)) as v(sc,ec,q)
join public.subjects s on s.code = v.sc join public.equipment_types e on e.code = v.ec
on conflict do nothing;

insert into public.academic_terms (name, start_date, end_date, is_current)
values ('DEV 1st Semester AY 2026-2027', '2026-08-17', '2026-12-19', true)
on conflict (name) do nothing;

insert into public.class_sections (term_id, subject_id, section_code, enrollment)
select t.id, s.id, v.sec, v.enr
from public.academic_terms t, (values
  ('DEV-PROG1','A',28), ('DEV-CHEM','A',28), ('DEV-MATH','A',38), ('DEV-MATH','B',44),
  ('DEV-MATH','C',33), ('DEV-ENG','A',35), ('DEV-PHYS','A',30)) as v(subj,sec,enr)
join public.subjects s on s.code = v.subj
where t.name = 'DEV 1st Semester AY 2026-2027'
on conflict (term_id, subject_id, section_code) do nothing;

-- Weekly meetings (ISO weekday: 1 = Monday). Designed test cases, all on Mondays 2026-10-19 unless noted:
--  * Room 107 is free 08:30-09:00, so at 08:30 it is free for 30 minutes but not an hour.
--  * Room 307 is busy 08:00-09:30 and 10:30-12:00, so at 09:30 it is free for exactly 60 minutes.
--  * Teacher DEV-002 teaches 08:00-09:30 in 307, so another class for DEV-002 at 09:00 must be rejected.
--  * Room 402 has a maintenance block 08:00-12:00 on 2026-10-19. Room 408 is inactive.
--  * Room 107 class is cancelled on 2026-10-26.
insert into public.class_schedules (section_id, classroom_id, teacher_id, day_of_week, start_time, end_time, valid_from, valid_to)
select sec.id, c.id, t.id, v.dow, v.st::time, v.et::time, '2026-08-17', '2026-12-19'
from (values
  ('DEV-MATH','A','L1B2','DEV-001',1,'09:00','10:30'),
  ('DEV-ENG','A','L3B2','DEV-002',1,'08:00','09:30'),
  ('DEV-MATH','B','L3B2','DEV-003',1,'10:30','12:00'),
  ('DEV-PHYS','A','R2F1','DEV-001',2,'10:00','11:30'),
  ('DEV-PROG1','A','R3F1','DEV-004',1,'13:00','16:00'),
  ('DEV-CHEM','A','L2B1','DEV-005',2,'14:00','17:00'),
  ('DEV-MATH','C','R4F1','DEV-005',1,'09:00','10:30')) as v(subj,sec,room,emp,dow,st,et)
join public.subjects s on s.code = v.subj
join public.class_sections sec on sec.subject_id = s.id and sec.section_code = v.sec
join public.classrooms c on c.model_object_id = v.room
join public.teachers t on t.employee_no = v.emp
where not exists (select 1 from public.class_schedules x where x.section_id = sec.id);

insert into public.schedule_cancellations (schedule_id, cancel_date, reason)
select s.id, '2026-10-26', 'DEV sample cancellation'
from public.class_schedules s join public.classrooms c on c.id = s.classroom_id
where c.model_object_id = 'L1B2'
on conflict (schedule_id, cancel_date) do nothing;

insert into public.maintenance_blocks (classroom_id, starts_at, ends_at, reason)
select c.id, '2026-10-19 08:00:00+08', '2026-10-19 12:00:00+08', 'DEV sample maintenance'
from public.classrooms c
where c.model_object_id = 'R4F2'
  and not exists (select 1 from public.maintenance_blocks m where m.classroom_id = c.id);
