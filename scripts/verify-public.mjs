// Live check of the public/admin split against a RUNNING API (npm run dev:api, or API_URL=https://your-api).
// Needs no keys and creates nothing: it only sends anonymous requests and expects them to behave like a visitor.
const api = (process.env.API_URL ?? 'http://localhost:3000') + '/api';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : extra ? '  -> ' + extra : ''}`);
};
const call = async (path, { method = 'GET', body, origin } = {}) => {
  const res = await fetch(api + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, cors: res.headers.get('access-control-allow-origin') };
};

for (const p of ['/buildings', '/floors', '/classrooms', '/teachers', '/subjects', '/sections', '/terms', '/schedules', '/room-categories', '/equipment-types', '/room-equipment', '/campuses', '/subject-equipment-requirements', '/availability/status']) {
  const r = await call(p);
  check(`visitor can read ${p} (200)`, r.status === 200, String(r.status));
}
const from = new Date().toISOString().slice(0, 10);
const to = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
check('visitor can open the timetable (200)', (await call(`/timetable?from=${from}&to=${to}`)).status === 200);
check('visitor can use the room finder (200)', (await call('/availability/search?preset=now')).status === 200);

const t = await call('/teachers');
const flat = JSON.stringify(t.json);
check('teacher emails, employee numbers and author ids are hidden', !/"(email|employee_no|user_id|created_by)"/.test(flat));
const tt = await call(`/timetable?from=${from}&to=${to}`);
check('maintenance reasons are hidden in the timetable', !/"reason"/.test(JSON.stringify(tt.json?.maintenance ?? [])));

for (const [m, p] of [['GET', '/me'], ['GET', '/maintenance-blocks'], ['GET', '/admin/dashboard'], ['GET', '/admin/users'], ['POST', '/buildings'], ['PATCH', '/buildings/11111111-1111-4111-8111-111111111111'], ['DELETE', '/schedules/11111111-1111-4111-8111-111111111111'], ['POST', '/schedules'], ['POST', '/schedules/check'], ['POST', '/equipment-types'], ['PUT', '/room-equipment']]) {
  const r = await call(p, { method: m, body: m === 'GET' || m === 'DELETE' ? undefined : {} });
  check(`visitor is refused ${m} ${p} (401)`, r.status === 401, String(r.status));
}
if (process.env.EXPECT_CORS_ORIGIN) {
  const ok = await call('/health', { origin: process.env.EXPECT_CORS_ORIGIN });
  check(`CORS allows ${process.env.EXPECT_CORS_ORIGIN}`, ok.cors === process.env.EXPECT_CORS_ORIGIN, String(ok.cors));
  const bad = await call('/health', { origin: 'https://evil.example' });
  check('CORS does not allow other sites', bad.cors === null, String(bad.cors));
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
