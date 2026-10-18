-- UCC CampusSphere, Phase 2: security and safeguard tests. DEVELOPMENT PROJECT ONLY.
-- Run in the Supabase SQL editor. It creates two throwaway auth users, checks what each role can and cannot do,
-- then ends with a deliberate error whose message is the result, so NOTHING is saved.
-- Needs the sample data from supabase/seed.sql. Expected values are listed at the bottom.
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  r jsonb := '{}'::jsonb; n int; sid uuid; cid uuid; tid uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (ua,'rls-a@test.invalid','authenticated','authenticated'),(ub,'rls-b@test.invalid','authenticated','authenticated');
  update public.user_roles set role='admin' where user_id=ub;
  r := r || jsonb_build_object('new_user_default_role', (select role from public.user_roles where user_id=ua));

  begin set local role anon; perform 1 from public.classrooms limit 1; r := r || '{"anon_read_classrooms":"ALLOWED (bad)"}'; reset role;
  exception when others then reset role; r := r || jsonb_build_object('anon_read_classrooms','denied: '||sqlerrm); end;

  perform set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.classrooms;      r := r || jsonb_build_object('user_sees_classrooms', n);
  select count(*) into n from public.class_schedules; r := r || jsonb_build_object('user_sees_schedules', n);
  select count(*) into n from public.user_roles;      r := r || jsonb_build_object('user_sees_roles_rows', n);
  select count(*) into n from public.audit_logs;      r := r || jsonb_build_object('user_sees_audit_rows', n);
  begin update public.user_roles set role='admin' where user_id=ua; r := r || '{"user_self_promote":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('user_self_promote','denied: '||sqlerrm); end;
  begin update public.profiles set status='active', email='x@x' where id=ua; r := r || '{"user_edit_email_status":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('user_edit_email_status','denied: '||sqlerrm); end;
  begin update public.profiles set full_name='Own Name' where id=ua; get diagnostics n = row_count; r := r || jsonb_build_object('user_edit_own_name','rows='||n);
  exception when others then r := r || jsonb_build_object('user_edit_own_name','denied: '||sqlerrm); end;
  begin delete from public.class_schedules; r := r || '{"user_delete_schedules":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('user_delete_schedules','denied: '||sqlerrm); end;
  begin perform * from public.class_occurrences(current_date, current_date); r := r || '{"user_call_occurrences":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('user_call_occurrences','denied: '||sqlerrm); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',ub,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.user_roles; r := r || jsonb_build_object('admin_sees_roles_rows', n);
  begin insert into public.audit_logs (action, entity) values ('x','y'); r := r || '{"admin_insert_audit_from_browser":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('admin_insert_audit_from_browser','denied: '||sqlerrm); end;
  reset role;

  update public.profiles set status='suspended' where id=ua;
  perform set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.classrooms; r := r || jsonb_build_object('suspended_sees_classrooms', n);
  reset role;

  select id into sid from public.class_sections limit 1;
  select c.id into cid from public.classrooms c where model_object_id='L3B2';
  select id into tid from public.teachers where employee_no='DEV-004';
  begin insert into public.class_schedules (section_id,classroom_id,teacher_id,day_of_week,start_time,end_time,valid_from,valid_to)
    values (sid,cid,tid,1,'09:00','10:00','2026-08-17','2026-12-19'); r := r || '{"room_overlap_insert":"ALLOWED (bad)"}';
  exception when exclusion_violation then r := r || jsonb_build_object('room_overlap_insert','rejected by DB'); end;
  select c.id into cid from public.classrooms c where model_object_id='L1B2';
  select id into tid from public.teachers where employee_no='DEV-002';
  begin insert into public.class_schedules (section_id,classroom_id,teacher_id,day_of_week,start_time,end_time,valid_from,valid_to)
    values (sid,cid,tid,1,'08:30','09:00','2026-08-17','2026-12-19'); r := r || '{"teacher_overlap_insert":"ALLOWED (bad)"}';
  exception when exclusion_violation then r := r || jsonb_build_object('teacher_overlap_insert','rejected by DB'); end;

  raise exception 'RESULT %', jsonb_pretty(r);
end $$;
-- Expected: new_user_default_role=user; anon denied; user sees 13 classrooms, 7 schedules, 1 role row, 0 audit rows;
-- self-promote, email/status edit, schedule delete, availability call all denied; own name edit rows=1;
-- admin sees 2 role rows and still cannot write audit_logs from a browser; suspended user sees 0 classrooms;
-- both overlap inserts rejected by DB.
