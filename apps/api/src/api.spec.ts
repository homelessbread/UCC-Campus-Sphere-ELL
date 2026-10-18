import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { AuthUser } from './auth/auth.types';
import { SupabaseService } from './common/supabase.service';
import { configureApp } from './configure-app';
import { loadConfig } from './config';

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

/** A stand-in for Supabase: every query resolves to what the test sets, and every call is recorded. */
class FakeSupabase {
  calls: { table: string; op: string; payload?: unknown }[] = [];
  error: { code: string; message: string } | null = null;
  rpcRows: unknown[] = [];
  tables: Record<string, unknown[]> = {};

  get client() {
    return this;
  }

  from(table: string) {
    let op = 'select';
    let inserted: object = {};
    const chain: Record<string, unknown> = {};
    const done = (single: boolean) => {
      this.calls.push({ table, op });
      const rows = this.tables[table] ?? [];
      if (this.error) return { data: null, error: this.error };
      if (single)
        return {
          data: op === 'select' || op === 'delete' ? (rows[0] ?? null) : { id: ID, ...inserted },
          error: null,
        };
      return { data: rows, error: null, count: rows.length };
    };
    for (const m of ['select', 'eq', 'order', 'range', 'lt', 'gt', 'lte', 'gte', 'or', 'neq'])
      chain[m] = () => chain;
    for (const m of ['insert', 'update', 'delete']) {
      chain[m] = (payload?: unknown) => {
        op = m;
        if (payload !== undefined) inserted = payload as object;
        if (payload !== undefined) this.calls.push({ table, op: `${m}:payload`, payload });
        return chain;
      };
    }
    chain.single = () => Promise.resolve(done(true));
    chain.maybeSingle = () => Promise.resolve(done(true));
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(done(false)).then(res, rej);
    return chain;
  }

  rpc() {
    const result = Promise.resolve({ data: this.rpcRows, error: null });
    return Object.assign(result, { range: () => result });
  }
}

const fakeAuth = {
  async authenticate(token: string): Promise<AuthUser> {
    if (token === 'admin-token') return ADMIN;
    if (token === 'user-token') return USER;
    if (token === 'suspended-token') throw new ForbiddenException('This account is suspended.');
    throw new UnauthorizedException('Your session is invalid or has expired.');
  },
};

describe('API foundation (database replaced by a fake)', () => {
  let app: INestApplication;
  let db: FakeSupabase;

  beforeEach(async () => {
    db = new FakeSupabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(db)
      .overrideProvider(AuthService)
      .useValue(fakeAuth)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, loadConfig({}));
    await app.init();
  });
  afterEach(async () => app.close());

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  const READ_ROUTES = [
    'me',
    'buildings',
    'floors',
    'classrooms',
    'teachers',
    'subjects',
    'sections',
    'terms',
    'schedules',
    'maintenance-blocks',
    'room-categories',
    'equipment-types',
    'room-equipment',
  ];

  const WRITE_BODIES: Record<string, object> = {
    buildings: { campus_id: ID, code: 'B1', name: 'Building 1' },
    floors: { building_id: ID, level: 1, name: '1st floor' },
    classrooms: { floor_id: ID, category_id: ID, name: 'Room 1', capacity: 40 },
    teachers: { full_name: 'Sample Teacher' },
    subjects: { code: 'S1', title: 'Subject' },
    sections: { term_id: ID, subject_id: ID, section_code: 'A' },
    terms: { name: 'T1', start_date: '2026-08-01', end_date: '2026-12-01' },
    schedules: {
      section_id: ID,
      classroom_id: ID,
      day_of_week: 1,
      start_time: '08:00',
      end_time: '09:30',
      valid_from: '2026-08-17',
      valid_to: '2026-12-19',
    },
    'schedule-exceptions': { schedule_id: ID, exception_date: '2026-11-09', classroom_id: ID },
    'schedule-cancellations': { schedule_id: ID, cancel_date: '2026-10-26' },
    'non-instructional-days': { day: '2026-11-02', name: 'Sample holiday' },
    'maintenance-blocks': {
      classroom_id: ID,
      starts_at: '2026-10-19T08:00:00+08:00',
      ends_at: '2026-10-19T12:00:00+08:00',
    },
  };

  // Public site: browsing needs no sign-in. Anything that changes data, or shows who a person is, still does.
  const PRIVATE_READS = ['me', 'maintenance-blocks'];
  const PUBLIC_READS = READ_ROUTES.filter((r) => !PRIVATE_READS.includes(r));

  describe('public reads need no sign-in; everything else does', () => {
    it('allows /health without a token', async () => {
      await http().get('/api/health').expect(200);
    });
    it.each(PUBLIC_READS)('GET /%s without a token is 200', async (route) => {
      await http().get(`/api/${route}`).expect(200);
    });
    it.each(PRIVATE_READS)('GET /%s without a token is 401', async (route) => {
      await http().get(`/api/${route}`).expect(401);
    });
    it.each(Object.keys(WRITE_BODIES))('writing %s without a token is 401', async (route) => {
      await http().post(`/api/${route}`).send(WRITE_BODIES[route]).expect(401);
      await http().patch(`/api/${route}/${ID}`).send({}).expect(401);
      await http().delete(`/api/${route}/${ID}`).expect(401);
      expect(db.calls.filter((c) => c.op !== 'select')).toEqual([]);
    });
    it('a bad token on a public page is treated as an anonymous visitor, not an error', async () => {
      await http().get('/api/buildings').set(as('nonsense')).expect(200);
    });
    it('hides emails, employee numbers and author ids from visitors but not from admins', async () => {
      db.tables.teachers = [
        {
          id: ID,
          full_name: 'Sample Teacher',
          email: 't@x.test',
          employee_no: 'E1',
          user_id: ID,
          created_by: ID,
          is_active: true,
        },
      ];
      const anon = await http().get('/api/teachers').expect(200);
      expect(anon.body.data[0]).toEqual({ id: ID, full_name: 'Sample Teacher', is_active: true });
      const one = await http().get(`/api/teachers/${ID}`).expect(200);
      expect(one.body).toEqual({ id: ID, full_name: 'Sample Teacher', is_active: true });
      const user = await http().get('/api/teachers').set(as('user-token')).expect(200);
      expect(user.body.data[0].email).toBeUndefined();
      const adm = await http().get('/api/teachers').set(as('admin-token')).expect(200);
      expect(adm.body.data[0].email).toBe('t@x.test');
    });
    it('rate limits one visitor after 120 requests a minute (429)', async () => {
      for (let i = 0; i < 120; i++) await http().get('/api/buildings').expect(200);
      await http().get('/api/buildings').expect(429);
    });
    it('rejects a bad token with 401 and a suspended account with 403', async () => {
      await http().get('/api/me').set(as('nonsense')).expect(401);
      await http().get('/api/me').set(as('suspended-token')).expect(403);
    });
  });

  describe('the two roles', () => {
    it.each(PUBLIC_READS.concat('me'))('a regular user can read /%s', async (route) => {
      await http().get(`/api/${route}`).set(as('user-token')).expect(200);
    });
    it('a regular user cannot read /maintenance-blocks (403)', async () => {
      await http().get('/api/maintenance-blocks').set(as('user-token')).expect(403);
    });

    it.each(Object.keys(WRITE_BODIES))(
      'a regular user cannot create, edit or delete %s (403)',
      async (route) => {
        await http()
          .post(`/api/${route}`)
          .set(as('user-token'))
          .send(WRITE_BODIES[route])
          .expect(403);
        await http().patch(`/api/${route}/${ID}`).set(as('user-token')).send({}).expect(403);
        await http().delete(`/api/${route}/${ID}`).set(as('user-token')).expect(403);
        expect(db.calls.filter((c) => c.op !== 'select')).toEqual([]);
      },
    );

    it.each(Object.keys(WRITE_BODIES))(
      'an admin can create %s and the change is audited',
      async (route) => {
        await http()
          .post(`/api/${route}`)
          .set(as('admin-token'))
          .send(WRITE_BODIES[route])
          .expect(201);
        const audit = db.calls.find((c) => c.table === 'audit_logs' && c.op === 'insert:payload');
        expect(audit?.payload).toMatchObject({ actor_id: ADMIN.id, action: 'create' });
      },
    );

    it('reports the role the server loaded, and ignores role claims sent by the client', async () => {
      const res = await http()
        .get('/api/me')
        .set(as('user-token'))
        .set('x-role', 'admin')
        .expect(200);
      expect(res.body.role).toBe('user');
      await http()
        .post('/api/buildings')
        .set(as('user-token'))
        .set('x-role', 'admin')
        .send(WRITE_BODIES.buildings)
        .expect(403);
    });

    it('records who created a schedule', async () => {
      await http()
        .post('/api/schedules')
        .set(as('admin-token'))
        .send(WRITE_BODIES.schedules)
        .expect(201);
      const insert = db.calls.find(
        (c) => c.table === 'class_schedules' && c.op === 'insert:payload',
      );
      expect(insert?.payload).toMatchObject({ created_by: ADMIN.id });
    });
  });

  describe('validation and errors', () => {
    it('rejects missing, wrong-typed and unknown fields with one consistent error shape', async () => {
      const res = await http()
        .post('/api/classrooms')
        .set(as('admin-token'))
        .send({ name: 'No floor', capacity: 0, role: 'admin' })
        .expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        path: '/api/classrooms',
      });
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('floor_id')]),
      );
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('should not exist')]),
      );
      expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
    });

    it('rejects a schedule that ends before it starts', async () => {
      const bad = { ...WRITE_BODIES.schedules, start_time: '10:00', end_time: '09:00' };
      await http().post('/api/schedules').set(as('admin-token')).send(bad).expect(400);
    });

    it('rejects a maintenance block that ends before it starts', async () => {
      const bad = { ...WRITE_BODIES['maintenance-blocks'], ends_at: '2026-10-19T07:00:00+08:00' };
      await http().post('/api/maintenance-blocks').set(as('admin-token')).send(bad).expect(400);
    });

    it('rejects a malformed id with 400 and an unknown record with 404', async () => {
      await http().get('/api/buildings/not-a-uuid').set(as('user-token')).expect(400);
      await http().get(`/api/buildings/${ID}`).set(as('user-token')).expect(404);
    });

    it('rejects bad filters and paging values', async () => {
      await http().get('/api/classrooms?floor_id=nope').set(as('user-token')).expect(400);
      await http().get('/api/classrooms?limit=100000').set(as('user-token')).expect(400);
    });

    it('turns a database overlap rejection into 409 without leaking SQL', async () => {
      db.error = {
        code: '23P01',
        message:
          'conflicting key value violates exclusion constraint "class_schedules_no_room_overlap"',
      };
      const res = await http()
        .post('/api/schedules')
        .set(as('admin-token'))
        .send(WRITE_BODIES.schedules)
        .expect(409);
      expect(JSON.stringify(res.body)).not.toContain('exclusion constraint');
    });

    it('hides unexpected database errors behind a generic 500', async () => {
      db.error = { code: 'XX000', message: 'secret internal detail' };
      const res = await http().get('/api/buildings').set(as('user-token')).expect(500);
      expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
    });
  });

  describe('availability endpoints (database replaced by a fake)', () => {
    const when = (hhmm: string) => new Date(`2026-10-19T${hhmm}:00+08:00`).toISOString();
    beforeEach(() => {
      const room = (id: string, name: string, capacity: number) => ({
        id,
        floor_id: 'f1',
        category_id: 'c1',
        code: id,
        name,
        capacity,
        status: 'active',
        model_object_id: `M-${id}`,
      });
      db.tables.classrooms = [
        room('r1', 'Room 1', 40),
        room('r2', 'Room 2', 60),
        { ...room('r3', 'Room 3', 60), status: 'inactive' },
      ];
      db.tables.floors = [{ id: 'f1', building_id: 'b1', level: 1 }];
      db.tables.buildings = [{ id: 'b1', code: 'CONG-L', name: 'Left wing' }];
      db.tables.room_categories = [{ id: 'c1', code: 'regular', name: 'Regular classroom' }];
      db.tables.equipment_types = [{ id: 'e1', code: 'projector', name: 'Projector' }];
      db.tables.room_equipment = [{ classroom_id: 'r2', equipment_type_id: 'e1', quantity: 1 }];
      db.tables.maintenance_blocks = [];
      db.rpcRows = [
        {
          classroom_id: 'r1',
          starts_at: when('09:00'),
          ends_at: when('10:30'),
          subject_code: 'MATH',
          section_code: 'A',
          teacher_name: 'T',
          is_moved: false,
        },
      ];
    });
    const ids = (body: { rooms: { classroom_id: string }[] }) =>
      body.rooms.map((r) => r.classroom_id);

    it('search: a class starting in 20 minutes excludes the room from a 30 minute search but not a 15 minute one', async () => {
      const thirty = await http()
        .get('/api/availability/search?preset=30&start=2026-10-19T08:40')
        .set(as('user-token'))
        .expect(200);
      expect(ids(thirty.body)).toEqual(['r2']);
      expect(thirty.body.alternatives.free_later).toEqual([]); // rooms qualify, so no fallback list
      const fifteen = await http()
        .get('/api/availability/search?preset=custom&start=2026-10-19T08:40&duration_minutes=15')
        .set(as('user-token'))
        .expect(200);
      expect(ids(fifteen.body).sort()).toEqual(['r1', 'r2']);
    });

    it('search: filters, ranking numbers, equipment and explanations', async () => {
      const res = await http()
        .get(
          '/api/availability/search?start=2026-10-19T11:00&preset=60&equipment=projector&min_capacity=50',
        )
        .set(as('user-token'))
        .expect(200);
      expect(ids(res.body)).toEqual(['r2']);
      expect(res.body.rooms[0]).toMatchObject({
        rank: 1,
        model_object_id: 'M-r2',
        building: { code: 'CONG-L' },
        floor: { level: 1 },
      });
      expect(res.body.rooms[0].reasons.join(' ')).toMatch(/Has 1 projector/);
      expect(res.body.interval).toMatchObject({
        duration_minutes: 60,
        time_zone: 'Asia/Manila',
        start_local: '2026-10-19 11:00',
      });
    });

    it('search: says plainly when nothing matches', async () => {
      const res = await http()
        .get('/api/availability/search?start=2026-10-19T11:00&preset=60&min_capacity=500')
        .set(as('user-token'))
        .expect(200);
      expect(res.body.rooms).toEqual([]);
      expect(res.body.message).toMatch(/^No room matches/);
    });

    it('search: include_unavailable lists blocked rooms with reasons (inactive room included)', async () => {
      const res = await http()
        .get(
          '/api/availability/search?preset=custom&start=2026-10-19T09:30&duration_minutes=30&include_unavailable=true',
        )
        .set(as('user-token'))
        .expect(200);
      const byId = Object.fromEntries(
        res.body.unavailable.map((r: { classroom_id: string; why_not: string[] }) => [
          r.classroom_id,
          r.why_not,
        ]),
      );
      expect(byId.r1[0]).toMatch(/Class MATH A is in progress until 10:30/);
      expect(byId.r3).toEqual(['The room is inactive.']);
    });

    it('search: validates its input', async () => {
      for (const bad of [
        'preset=weekly',
        'min_capacity=0',
        'equipment=pro%20jector',
        'start=nope',
        'preset=custom',
        'unknown=1',
        'building_id=x',
        'duration_minutes=2000',
      ]) {
        await http().get(`/api/availability/search?${bad}`).set(as('user-token')).expect(400);
      }
    });

    it('status: reports every room with its schedule-based state and counts', async () => {
      const res = await http()
        .get('/api/availability/status?at=2026-10-19T09:30')
        .set(as('user-token'))
        .expect(200);
      expect(res.body.counts).toEqual({ free: 1, occupied: 1, maintenance: 0, inactive: 1 });
      const r1 = res.body.rooms.find((r: { classroom_id: string }) => r.classroom_id === 'r1');
      expect(r1).toMatchObject({ status: 'occupied', available_from_local: '2026-10-19 10:30' });
      expect(r1.current.label).toBe('MATH A');
      expect(res.body.basis).toMatch(/not a measurement/);
    });

    it('status: treats a maintenance block as the room being under maintenance', async () => {
      db.tables.maintenance_blocks = [
        { classroom_id: 'r2', starts_at: when('08:00'), ends_at: when('12:00'), reason: 'Leak' },
      ];
      const res = await http()
        .get('/api/availability/status?at=2026-10-19T09:30')
        .set(as('user-token'))
        .expect(200);
      expect(res.body.counts.maintenance).toBe(1);
    });

    it('status: rejects a bad instant', async () => {
      await http().get('/api/availability/status?at=soon').set(as('user-token')).expect(400);
    });
  });
});
