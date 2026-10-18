import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { SupabaseService } from '../common/supabase.service';
import { configureApp } from '../configure-app';
import { loadConfig } from '../config';

const ID = '11111111-1111-4111-8111-111111111111';
const ADMIN: AuthUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'a@x.test',
  fullName: null,
  role: 'admin',
};
const USER: AuthUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'u@x.test',
  fullName: null,
  role: 'user',
};

class FakeDb {
  rpcRows: unknown[] = [];
  get client() {
    return this;
  }
  from() {
    const chain: Record<string, unknown> = {};
    for (const m of [
      'select',
      'eq',
      'order',
      'lt',
      'gt',
      'lte',
      'gte',
      'in',
      'limit',
      'insert',
      'update',
      'upsert',
      'delete',
    ])
      chain[m] = () => chain;
    chain.single = () => Promise.resolve({ data: { id: ID }, error: null });
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(res);
    return chain;
  }
  rpc() {
    return Promise.resolve({ data: this.rpcRows, error: null });
  }
}

describe('Phase 4 admin routes (database replaced by a fake)', () => {
  let app: INestApplication;
  let db: FakeDb;
  beforeEach(async () => {
    db = new FakeDb();
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(db)
      .overrideProvider(AuthService)
      .useValue({ authenticate: async (t: string) => (t === 'admin' ? ADMIN : USER) })
      .compile();
    app = m.createNestApplication();
    configureApp(app, loadConfig({}));
    await app.init();
  });
  afterEach(async () => app.close());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());
  const CHECK = {
    section_id: ID,
    classroom_id: ID,
    day_of_week: 1,
    start_time: '08:00',
    end_time: '09:30',
    valid_from: '2026-08-17',
    valid_to: '2026-12-19',
  };

  it('keeps admin-only routes away from ordinary users', async () => {
    for (const [method, url] of [
      ['get', '/api/admin/dashboard'],
      ['get', '/api/admin/users'],
      ['patch', `/api/admin/users/${ID}`],
      ['post', '/api/schedules/check'],
      ['post', '/api/equipment-types'],
      ['put', '/api/room-equipment'],
    ] as const) {
      const res = await http()[method](url).set(as('user')).send({});
      expect(res.status).toBe(403);
    }
  });

  it('requires sign-in for every admin route', async () => {
    for (const [method, url] of [
      ['get', '/api/admin/dashboard'],
      ['get', '/api/admin/users'],
      ['patch', `/api/admin/users/${ID}`],
      ['post', '/api/schedules/check'],
      ['post', '/api/equipment-types'],
      ['put', '/api/room-equipment'],
      ['delete', '/api/room-equipment'],
    ] as const) {
      expect((await http()[method](url).send({})).status).toBe(401);
    }
  });

  it('refuses to let an admin change their own role', async () => {
    const res = await http()
      .patch(`/api/admin/users/${ADMIN.id}`)
      .set(as('admin'))
      .send({ role: 'user' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid role value', async () => {
    const res = await http()
      .patch(`/api/admin/users/${ID}`)
      .set(as('admin'))
      .send({ role: 'superuser' });
    expect(res.status).toBe(400);
  });

  it('check: reports an end time before the start without touching the database', async () => {
    const res = await http()
      .post('/api/schedules/check')
      .set(as('admin'))
      .send({ ...CHECK, end_time: '07:00' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(false);
    expect(res.body.problems[0].code).toBe('UC009');
  });

  it('check: ok when only warnings come back, not ok when an error does', async () => {
    db.rpcRows = [
      {
        severity: 'warning',
        code: 'W002',
        message: 'No teacher is assigned yet.',
        related_schedule_id: null,
      },
    ];
    let res = await http().post('/api/schedules/check').set(as('admin')).send(CHECK);
    expect(res.body.ok).toBe(true);
    db.rpcRows.push({
      severity: 'error',
      code: '23P01',
      message: 'Room busy',
      related_schedule_id: ID,
    });
    res = await http().post('/api/schedules/check').set(as('admin')).send(CHECK);
    expect(res.body.ok).toBe(false);
  });

  it('timetable and availability are public; a missing date range is still a 400', async () => {
    expect((await http().get('/api/timetable')).status).toBe(400);
    const ok = await http().get('/api/timetable?from=2026-10-19&to=2026-10-25');
    expect(ok.status).toBe(200);
    expect(ok.body.occurrences).toEqual([]);
  });
});
