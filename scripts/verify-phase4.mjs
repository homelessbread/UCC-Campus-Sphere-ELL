// Live Phase 4 check against YOUR Supabase development project and a RUNNING API (npm run dev:api).
// Needs migration 5 (supabase/migrations/20261016000005_schedule_precheck.sql) applied first.
// Creates two temporary users (regular + admin), exercises the admin endpoints, then deletes everything it made.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

for (const f of ['apps/api/.env', 'apps/admin/.env']) {
  try {
    process.loadEnvFile(f);
  } catch {
    console.error(`Missing ${f}. Copy the matching .env.example and fill it in first.`);
    process.exit(2);
  }
}
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const api = (process.env.API_URL ?? 'http://localhost:3000') + '/api';
if (!url || !secret || !publishable || /YOUR|your-/.test(url + secret + publishable)) {
  console.error('Fill in SUPABASE_URL, SUPABASE_SECRET_KEY and VITE_SUPABASE_PUBLISHABLE_KEY first.');
  process.exit(2);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : extra ? '  -> ' + extra : ''}`);
};
const call = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(api + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
};

const created = [];
let typeId;
const stamp = randomBytes(4).toString('hex');
const password = randomBytes(12).toString('hex') + 'Aa1!';
const mk = async (tag) => {
  const email = `verify4-${tag}-${stamp}@ucc-verify.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  created.push(data.user.id);
  const { data: s, error: e2 } = await createClient(url, publishable, opts).auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`sign-in failed: ${e2.message}`);
  return { id: data.user.id, token: s.session.access_token };
};

try {
  const user = await mk('user');
  const boss = await mk('admin');
  await admin.from('user_roles').upsert({ user_id: boss.id, role: 'admin' }, { onConflict: 'user_id' });

  for (const [m, p] of [['GET', '/admin/dashboard'], ['GET', '/admin/users'], ['POST', '/schedules/check'], ['POST', '/equipment-types']]) {
    const r = await call(p, { token: user.token, method: m, body: m === 'POST' ? {} : undefined });
    check(`ordinary user is refused ${m} ${p} (403)`, r.status === 403, String(r.status));
  }
  check('no token is refused (401)', (await call('/admin/dashboard')).status === 401);

  const dash = await call('/admin/dashboard', { token: boss.token });
  check('dashboard returns live totals', dash.status === 200 && typeof dash.json?.totals?.classrooms === 'number', String(dash.status));
  check('dashboard room counts add up', dash.json && Object.values({ a: dash.json.rooms.available, b: dash.json.rooms.occupied_by_schedule, c: dash.json.rooms.under_maintenance, d: dash.json.rooms.inactive }).reduce((x, y) => x + y, 0) === dash.json.rooms.items.length);
  check('dashboard carries the schedule-based disclaimer', /not a check of who is physically/i.test(dash.json?.basis ?? ''));

  const users = await call('/admin/users', { token: boss.token });
  check('admin lists users with roles', users.status === 200 && users.json.data.some((u) => u.id === boss.id && u.role === 'admin'));
  const self = await call(`/admin/users/${boss.id}`, { token: boss.token, method: 'PATCH', body: { role: 'user' } });
  check('admin cannot demote themselves (403)', self.status === 403, String(self.status));
  const promote = await call(`/admin/users/${user.id}`, { token: boss.token, method: 'PATCH', body: { role: 'admin' } });
  check('admin can promote a user', promote.status === 200 && promote.json?.role === 'admin', String(promote.status));
  const me = await call('/me', { token: user.token });
  check('the promoted user now sees role admin from the server', me.json?.role === 'admin');
  const demote = await call(`/admin/users/${user.id}`, { token: boss.token, method: 'PATCH', body: { role: 'user', status: 'suspended' } });
  check('admin can demote and suspend', demote.status === 200 && demote.json?.status === 'suspended');
  check('a suspended user is refused (403)', (await call('/me', { token: user.token })).status === 403);

  const sched = await call('/schedules?limit=1', { token: boss.token });
  const s = sched.json?.data?.[0];
  if (s) {
    const body = { section_id: s.section_id, classroom_id: s.classroom_id, teacher_id: s.teacher_id ?? undefined, day_of_week: s.day_of_week, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), valid_from: s.valid_from, valid_to: s.valid_to };
    const clash = await call('/schedules/check', { token: boss.token, method: 'POST', body });
    check('pre-check flags a clash with an existing class', clash.status === 201 && clash.json.ok === false && clash.json.problems.some((p) => p.code === '23P01'), JSON.stringify(clash.json));
    const own = await call('/schedules/check', { token: boss.token, method: 'POST', body: { ...body, exclude_schedule_id: s.id } });
    check('pre-check ignores the schedule being edited', own.json?.problems?.every((p) => p.code !== '23P01'));
    const saved = await call('/schedules', { token: boss.token, method: 'POST', body });
    check('the real save agrees with the pre-check (409)', saved.status === 409, String(saved.status));
    const late = await call('/schedules/check', { token: boss.token, method: 'POST', body: { ...body, start_time: '10:00', end_time: '09:00' } });
    check('pre-check rejects an end before the start', late.json?.problems?.[0]?.code === 'UC009');
  } else console.log('SKIP  schedule pre-check (no schedules in the database)');

  const tt = await call(`/timetable?from=${new Date().toISOString().slice(0, 10)}&to=${new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10)}`, { token: boss.token });
  check('timetable returns occurrences, holidays and maintenance', tt.status === 200 && Array.isArray(tt.json?.occurrences) && Array.isArray(tt.json?.holidays));
  check('timetable refuses a range over 63 days', (await call('/timetable?from=2026-01-01&to=2026-06-30', { token: boss.token })).status === 422);

  const t = await call('/equipment-types', { token: boss.token, method: 'POST', body: { code: `verify_${stamp}`, name: 'Verify temp' } });
  typeId = t.json?.id;
  check('admin creates an equipment type', t.status === 201 && typeId, String(t.status));
  const dup = await call('/equipment-types', { token: boss.token, method: 'POST', body: { code: `verify_${stamp}`, name: 'Again' } });
  check('duplicate equipment code is refused (409)', dup.status === 409, String(dup.status));
  const del = await call(`/equipment-types/${typeId}`, { token: boss.token, method: 'DELETE' });
  check('admin deletes it again', del.status === 200);
  typeId = undefined;
} catch (e) {
  check('script ran to the end', false, e instanceof Error ? e.message : String(e));
} finally {
  if (typeId) await admin.from('equipment_types').delete().eq('id', typeId);
  for (const id of created) await admin.from('audit_logs').delete().eq('actor_id', id);
  for (const id of created) await admin.auth.admin.deleteUser(id);
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Temporary users removed.`);
  process.exit(failed ? 1 : 0);
}
