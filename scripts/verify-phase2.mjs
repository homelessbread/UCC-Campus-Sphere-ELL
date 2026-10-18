// Live Phase 2 check against YOUR Supabase development project and a RUNNING API (npm run dev:api).
// It creates two temporary users (one regular, one admin), calls the real API and database, then deletes them.
// Only ever run it against the development project. Keys are read from apps/api/.env and apps/web/.env and never printed.
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
  console.error(
    'Fill in SUPABASE_URL, SUPABASE_SECRET_KEY and VITE_SUPABASE_PUBLISHABLE_KEY first.',
  );
  process.exit(2);
}

const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : extra ? '  -> ' + extra : ''}`);
};
const call = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(api + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
};

const stamp = Date.now();
const password = randomBytes(18).toString('base64url');
const created = [];
let createdBuildingId = null;

try {
  const health = await call('/health?check=db');
  check(
    'API reachable and Supabase query succeeds',
    health.status === 200 && health.json?.supabase?.connection === 'ok',
    JSON.stringify(health.json?.supabase),
  );

  const mk = async (tag) => {
    const email = `verify-${tag}-${stamp}@ucc-verify.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    created.push(data.user.id);
    const anon = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
    if (e2) throw new Error(`sign-in failed: ${e2.message}`);
    return {
      id: data.user.id,
      token: s.session.access_token,
      client: createClient(url, publishable, {
        global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    };
  };
  const user = await mk('user');
  const boss = await mk('admin');
  const { error: roleErr } = await admin
    .from('user_roles')
    .update({ role: 'admin' })
    .eq('user_id', boss.id);
  if (roleErr) throw new Error(`could not make test admin: ${roleErr.message}`);

  check(
    'new accounts get the user role automatically',
    (await call('/me', { token: user.token })).json?.role === 'user',
  );
  check(
    'promoted account is seen as admin',
    (await call('/me', { token: boss.token })).json?.role === 'admin',
  );
  check('browsing needs no token (public read -> 200)', (await call('/buildings')).status === 200);
  check('a garbage token on a public page is just a visitor (200)', (await call('/buildings', { token: 'garbage' })).status === 200);
  check('no token cannot write (401)', (await call('/buildings', { method: 'POST', body: {} })).status === 401);
  check('garbage token cannot use /me (401)', (await call('/me', { token: 'garbage' })).status === 401);

  const list = await call('/buildings', { token: user.token });
  check(
    'user can read buildings (sample data)',
    list.status === 200 && list.json?.total >= 2,
    `status ${list.status}`,
  );
  const campusId = (await admin.from('campuses').select('id').limit(1)).data?.[0]?.id;

  const newB = { campus_id: campusId, code: 'ZZ-VERIFY', name: 'Temporary verification building' };
  check(
    'user cannot create a building (403)',
    (await call('/buildings', { token: user.token, method: 'POST', body: newB })).status === 403,
  );
  const made = await call('/buildings', { token: boss.token, method: 'POST', body: newB });
  createdBuildingId = made.json?.id ?? null;
  check(
    'admin can create a building (201)',
    made.status === 201 && Boolean(createdBuildingId),
    `status ${made.status} ${JSON.stringify(made.json?.message)}`,
  );
  const del = await call(`/buildings/${createdBuildingId}`, {
    token: boss.token,
    method: 'DELETE',
  });
  check('admin can delete it again (200)', del.status === 200);
  if (createdBuildingId) {
    const { data: logs } = await admin
      .from('audit_logs')
      .select('action')
      .eq('entity_id', createdBuildingId);
    check(
      'both admin changes were written to the audit log',
      logs?.length === 2,
      `found ${logs?.length}`,
    );
  }

  // Phase 3 Smart Room Finder. Times without an offset are school time (Asia/Manila).
  const ids = async (q) =>
    (await call(`/availability/search?${q}`, { token: user.token })).json?.rooms?.map(
      (r) => r.model_object_id,
    ) ?? [];
  check(
    'finder: Room 107 free for 30 min at 08:30 Mon',
    (await ids('preset=30&start=2026-10-19T08:30')).includes('L1B2'),
  );
  check(
    'finder: Room 107 NOT free for 60 min at 08:30 (class starts at 09:00)',
    !(await ids('preset=60&start=2026-10-19T08:30')).includes('L1B2'),
  );
  check(
    'finder: Room 307 free for 60 min at 09:30',
    (await ids('preset=60&start=2026-10-19T09:30')).includes('L3B2'),
  );
  check(
    'finder: maintenance room and inactive room never offered',
    !(await ids('preset=30&start=2026-10-19T09:00')).some((m) => m === 'R4F2' || m === 'L4B1'),
  );
  check(
    'finder: Room 107 is free again on 2026-10-26 (that class is cancelled)',
    (await ids('preset=30&start=2026-10-26T09:30')).includes('L1B2'),
  );
  const wait = await call(
    '/availability/search?preset=60&start=2026-10-19T08:30&min_capacity=5000',
    {
      token: user.token,
    },
  );
  check(
    'finder: impossible request gives a clear message, not invented rooms',
    wait.status === 400 || (wait.json?.rooms?.length === 0 && Boolean(wait.json?.message)),
    `status ${wait.status}`,
  );

  const dup = await call('/schedules', {
    token: boss.token,
    method: 'POST',
    body: await (async () => {
      const { data: room } = await admin
        .from('classrooms')
        .select('id')
        .eq('model_object_id', 'L3B2')
        .single();
      const { data: sec } = await admin.from('class_sections').select('id').limit(1).single();
      return {
        section_id: sec.id,
        classroom_id: room.id,
        day_of_week: 1,
        start_time: '09:00',
        end_time: '10:00',
        valid_from: '2026-08-17',
        valid_to: '2026-12-19',
      };
    })(),
  });
  check('overlapping schedule is rejected (409)', dup.status === 409, `status ${dup.status}`);

  // Straight to the database with the publishable key, bypassing the API: the RLS rules must still hold.
  const selfPromote = await user.client
    .from('user_roles')
    .update({ role: 'admin' })
    .eq('user_id', user.id)
    .select();
  check(
    'direct database call cannot self-promote to admin',
    Boolean(selfPromote.error) || (selfPromote.data ?? []).length === 0,
  );
  const anonRead = await createClient(url, publishable).from('classrooms').select('id').limit(1);
  check('anonymous direct database read is blocked', Boolean(anonRead.error));
  const directWrite = await user.client
    .from('class_schedules')
    .delete()
    .neq('day_of_week', 0)
    .select();
  check(
    'direct database call cannot delete schedules',
    Boolean(directWrite.error) || (directWrite.data ?? []).length === 0,
  );
} catch (e) {
  check('script ran to the end', false, e instanceof Error ? e.message : String(e));
} finally {
  if (createdBuildingId) {
    await admin.from('audit_logs').delete().eq('entity_id', createdBuildingId);
    await admin.from('buildings').delete().eq('id', createdBuildingId);
  }
  for (const id of created) await admin.auth.admin.deleteUser(id);
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Temporary users removed.`);
  process.exit(failed ? 1 : 0);
}
