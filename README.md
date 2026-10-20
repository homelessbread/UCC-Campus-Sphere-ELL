# UCC CampusSphere

**3D Campus Navigation and Classroom Scheduling System. Explore. Locate. Learn.**

Students, teachers and administrators explore the campus in 3D, view classroom schedules and find rooms
that are free for a requested period. Availability is calculated from database records and is
schedule-based: an unscheduled room is not proof that nobody is inside it.

> **Status: Phase 4 of 9 (administrative dashboard), now split into a public site and a separate admin site.** The database, the NestJS API,
> the scheduling engine and the admin web app are in place. The student/teacher UI is Phase 5 and the 3D
> campus is Phase 6. See
> [What is and is not tested](#what-is-and-is-not-tested).

## Stack

| Area         | Choice                                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| Frontend     | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5        |
| 3D (Phase 6) | Three.js, React Three Fiber, Drei, GLB/glTF models from Blender                       |
| Backend      | Node.js, NestJS 11, TypeScript, REST, class-validator                                 |
| Cloud        | Supabase (PostgreSQL, Auth, RLS, Storage). No MySQL, SQLite or local database server. |
| Tooling      | npm workspaces, ESLint 9 + typescript-eslint, Prettier, Jest + supertest (API)        |

Package manager: **npm workspaces** (ships with Node, no extra install). TypeScript is pinned to 5.9
through `overrides` because TypeScript 6 rejects the shared package's `node10` module resolution.

## Repository structure

```text
ucc-campussphere/
├── apps/
│   ├── api/            NestJS API (GET /api/health)
│   └── web/            React + Vite app (status page)
├── packages/
│   └── shared/         Types and constants used by both apps (CJS + ESM build)
├── supabase/           migrations/, seed.sql, config.toml (filled from Phase 2)
├── assets/3d-models/   GLB models (Phase 6)
├── docs/prototypes/    Standalone Congress Building 3D prototype (reference for Phase 6)
├── .env.example        Overview of every variable
└── package.json        Workspace root and scripts
```

## Required software

Node.js 20.19+ or 22.12+ (developed on 22.22) with npm 10+, and Git. Any editor works. Check with:

```bash
node -v && npm -v && git --version
```

Node.js: <https://nodejs.org> (use the LTS installer). A Supabase account is **not** needed until Phase 2.

## Run it

```bash
npm install            # installs every workspace
cp apps/api/.env.example apps/api/.env      # optional in Phase 1, defaults work
cp apps/web/.env.example apps/web/.env      # public site: no keys needed
cp apps/admin/.env.example apps/admin/.env  # admin site: Supabase URL and publishable key
npm run dev            # API :3000, public site :5173, admin site :5174, together
```

Or separately: `npm run dev:api`, `npm run dev:web` (public) and `npm run dev:admin`.

Open <http://localhost:5173>. The page calls `/api/health` (Vite forwards `/api` to the API in
development, so CORS and `VITE_API_URL` are not needed locally).

## Verify it

```bash
curl http://localhost:3000/api/health
npm run typecheck
npm run lint
npm test               # API tests
npm run build          # production builds of shared, api, web
```

Expected health response:

```json
{
  "status": "ok",
  "service": "ucc-campussphere-api",
  "version": "0.1.0",
  "time": "2026-10-14T19:55:29.359Z",
  "schoolTimeZone": "Asia/Manila",
  "supabase": { "configured": false, "connection": "not_tested" }
}
```

## Environment variables

Real values live in `apps/api/.env` and `apps/admin/.env` (the public site needs none). Both are git-ignored. Only the
`.env.example` files are committed.

| Variable                        | App | Secret? | Purpose                                                       |
| ------------------------------- | --- | ------- | ------------------------------------------------------------- |
| `PORT`                          | api | no      | API port, default 3000                                        |
| `NODE_ENV`                      | api | no      | `development` or `production`                                 |
| `CORS_ORIGINS`                  | api | no      | Comma-separated browser origins allowed to call the API       |
| `SUPABASE_URL`                  | api | no      | Supabase project URL                                          |
| `SUPABASE_SECRET_KEY`           | api | **yes** | Server-side key, bypasses RLS. Never in the browser or in Git |
| `VITE_API_URL`                  | web | no      | API origin in production. Empty in development                |
| `VITE_SUPABASE_URL`             | web | no      | Supabase project URL                                          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | web | no      | Public key. Safe in the browser because RLS protects the data |

Everything with the `VITE_` prefix is bundled into the browser. Never put a secret there.

## Database and API design (Phase 2)

**One data layer.** The NestJS API talks to Supabase with the Supabase client and the **secret key**
(`apps/api/src/common/supabase.service.ts`). No Prisma, no second layer, no database password.
Browsers get **read-only** access under Row Level Security. Every write goes through the API.

**Roles.** Exactly two: `admin` and `user`. The role lives in `public.user_roles`, which no browser can
write. Every Supabase Auth sign-up automatically gets a profile and the `user` role. The API verifies the
Bearer token with Supabase Auth, then loads the role and status from the database on every request (it never
trusts a role sent by the client). Suspended accounts get 403. Promoting someone to admin is currently done in
the database (see below); an admin screen for it comes with the dashboard phase.

**Migrations** (`supabase/migrations/`, already applied to the dev project):

1. `core_schema`: 21 tables (profiles, roles, campuses, buildings, floors, classrooms, categories, equipment,
   teachers, subjects, sections, terms, weekly schedules, exceptions, cancellations, maintenance blocks, audit
   log, notifications, model assets). Classrooms carry `model_object_id`, the stable id used by the 3D model
   (for example `L3B2`). PostgreSQL exclusion constraints stop two active meetings sharing a room or a teacher
   at overlapping times, and stop overlapping terms and maintenance blocks.
2. `rls_and_grants`: RLS on every table, no browser write grants, admin-only audit log, users can edit only their own display name.
3. `room_availability`: a basic status function. **Replaced in Phase 3** by `class_occurrences` (migration 4).

**Time.** Schedules store local school time (`Asia/Manila`) as a weekday plus start/end `time`; maintenance
blocks store `timestamptz`. The availability function converts the requested instant to Manila time.

**Sample data** (`supabase/seed.sql`) is fictional and for the development project only. It is never run by the app.

### API (all under `/api`, JSON, snake_case fields matching the database)

| Route                                                                                                                          | Who            |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `GET /health` (`?check=db` runs a real Supabase query)                                                                         | anyone         |
| `GET /me`                                                                                                                      | signed in      |
| `GET` list and `GET /:id` on buildings, floors, classrooms, teachers, subjects, sections, terms, schedules, maintenance-blocks | signed in      |
| `GET room-categories equipment-types room-equipment`                                                                           | signed in      |
| `GET /availability?at=&horizon_minutes=&min_free_minutes=&min_capacity=&status=&building_id=&floor_id=`                        | signed in      |
| `POST`, `PATCH /:id`, `DELETE /:id` on those nine resources                                                                    | **admin only** |

Lists accept `limit` (max 500), `offset` and a few column filters. Errors always look like
`{ statusCode, error, message, path, timestamp }`. A schedule that overlaps another returns 409. Every admin change is written to `audit_logs`.

## Scheduling engine (Phase 3)

**Time model.** Weekly class meetings store local school time (`Asia/Manila`): an ISO weekday, a start and end `time`,
and a local date range. Maintenance blocks store absolute instants (`timestamptz`). Manila has no daylight saving, but every
conversion still names the time zone. Intervals are half-open: a class ending at 09:00 and one starting at 09:00 do not clash.
Dates and times sent without an offset are read as Manila time.

**One authority.** The database function `class_occurrences(from, to)` expands weekly rules into the real meetings on each
date, after removing holidays (`non_instructional_days`) and cancellations and applying one-date changes
(`schedule_exceptions`). The booking triggers and the API's availability service both read it, so they cannot disagree.

**Booking rules** (migration 4, enforced by the database whatever client calls it; the API turns them into HTTP 409 or 422):
room or teacher double-booked (exclusion constraints), inactive room or teacher, capacity below enrollment, wrong room type,
missing equipment, outside the academic term, room under maintenance, one-date changes that clash, invalid exception dates,
and enrollment growth beyond a room's seats. Room and teacher locks (`pg_advisory_xact_lock`) make simultaneous requests safe.

**Smart Room Finder** (`GET /api/availability/search`): `preset=now|30|60|custom`, `start`, `end` or `duration_minutes`,
filters `building_id`, `floor_id`, `floor_level`, `min_capacity`, `category`, `equipment` (for example `projector,computers:25`),
and preferences `preferred_building_id`, `preferred_floor_level`. A room qualifies only if it is free for the whole interval,
so a class starting in 20 minutes rules the room out for 30. Results are ranked and each room carries the reasons it
qualifies; when nothing matches, the response has a clear message plus rooms that miss only a filter and the next free slots.
`GET /api/availability/status` gives every room's status at one instant (free, occupied, maintenance, inactive) for the dashboard
and the 3D colouring. Status is **schedule-based**: it is not a measurement of who is physically in the room.

New admin endpoints: `non-instructional-days`, `schedule-exceptions`, `schedule-cancellations` (create, read, update, delete).

## Public site and admin site

|                             | Public site (`apps/web`, :5173)                                  | Admin site (`apps/admin`, :5174)                   |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Sign-in                     | None. Anyone can browse.                                         | Required, administrators only                      |
| Pages                       | Rooms now, Find a room, Timetable, Teachers, Subjects, 3D campus | Dashboard and every management page                |
| Talks to                    | The API, read-only                                               | The API with a Bearer token, plus Supabase sign-in |
| Supabase code in the bundle | None                                                             | Sign-in only                                       |

The 3D campus link opens the existing Congress Building model (`apps/web/public/campus-3d.html`). It is still the standalone
prototype and is not yet coloured by live availability; that wiring is Phase 6.

Public API routes (no token): GET on buildings, floors, classrooms, teachers, subjects, sections, terms, schedules,
schedule-cancellations, schedule-exceptions, non-instructional-days, campuses, room-categories, equipment-types,
room-equipment, subject-equipment-requirements, `/availability/status`, `/availability/search`, `/timetable`.
They hide teacher emails and employee numbers, author ids and maintenance reasons, and are limited to 120 requests per minute
per visitor. Everything else, including every write, needs an administrator's token. Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Check a running API with `npm run verify:public`.

## Admin dashboard (Phase 4)

**Apply migration 5 first** (`supabase/migrations/20261016000005_schedule_precheck.sql`, SQL editor or CLI). It adds
`check_class_schedule`, a read-only dry run of the booking rules so the form can show every problem before Save.

Set `apps/admin/.env` (see `.env.example`), run `npm run dev:api` and `npm run dev:admin`, open http://localhost:5174.
The admin site has no sign-up. Create your account in Supabase (**Authentication → Users → Add user**, auto confirm), then make it the first admin in the SQL editor:
`update public.user_roles set role = 'admin' where user_id = (select id from auth.users where email = 'you@example.com');`
After that, admins manage access on the Users page.

| Area                                                                                | Where                       |
| ----------------------------------------------------------------------------------- | --------------------------- |
| Live totals, room status by building and floor, recent changes                      | `/admin`                    |
| Buildings, floors, classrooms, maintenance blocks                                   | `/admin/...` Campus group   |
| Terms, subjects, sections, teachers                                                 | Academics and People groups |
| Weekly schedules with live conflict warnings, cancel a date, change a date, archive | `/admin/schedules`          |
| Daily and weekly timetable (holidays, changed classes, maintenance)                 | `/admin/timetable`          |
| Equipment types, room equipment, subject requirements                               | Equipment group             |
| Users: role and suspension (not your own, never the last admin)                     | `/admin/users`              |

New API routes (all admin only unless noted): `GET /admin/dashboard`, `GET /admin/users`, `PATCH /admin/users/:id`,
`POST /schedules/check`, `GET /timetable` (any signed-in user), `GET /campuses`, `GET /subject-equipment-requirements`,
`POST/PATCH/DELETE /equipment-types`, `PUT/DELETE /room-equipment`, `PUT/DELETE /subject-equipment-requirements`.
Room status everywhere comes from recorded schedules, holidays and maintenance. It is not a check of who is physically in a room.

Check it: `npm run verify:phase4` (live, needs the API running and migration 5 applied).

## Setup: connect your own Supabase development project

The development project **ucc-campussphere-dev** already exists in your Supabase account with the migrations and sample data applied.

1. Supabase dashboard > **Project Settings > API Keys**: copy the **publishable key** and the **secret key**.
2. Copy `apps/api/.env.example` to `apps/api/.env` and set `SUPABASE_SECRET_KEY`.
3. Copy `apps/admin/.env.example` to `apps/admin/.env` and set `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. `npm run dev`. The status page should now say **connected (a real query succeeded)**.
5. With the API running, in a second terminal: `npm run verify:phase2`. It makes two temporary users, runs the live checks and deletes them.

Do not paste keys into the chat. Making a real administrator: sign up once, then in the Supabase SQL editor run
`update public.user_roles set role = 'admin' where user_id = (select id from public.profiles where email = 'you@example.com');`

## What is and is not tested

Tested in the build environment (Linux, Node 22.22, npm 10.9):

- `npm install`, `typecheck`, `lint`, `format:check`, `build` all pass.
- API tests pass against a **fake** database: public reads need no sign-in, writes and admin routes need one, regular users get 403 on every
  create/edit/delete route, admins can write and the change is audited, spoofed role headers are ignored,
  suspended accounts are refused, validation and error shape, overlap errors become 409, no SQL leaks, availability filters.
- Against the **real cloud development database** (via SQL, in a rolled-back transaction): RLS and grants for anonymous,
  regular, admin and suspended users; users cannot self-promote, edit their own email/status, delete schedules or call
  the availability function; the overlap safeguards reject double-booked rooms and teachers; the availability function
  gives the designed results (free 30 but not 60 minutes, free exactly 60, cancelled class, maintenance, inactive room).
  The Supabase security advisor reports no issues. The SQL is in `supabase/tests/`.
- The API starts without keys: `/health` works, protected routes return 401, and sign-in checks return a clear 503.

Not tested: the API talking to the cloud database with a real secret key and real Supabase sign-in (needs your keys:
run `npm run verify:phase2`), deployment, Windows or macOS.

## Known limitations

- Adding maintenance over an already-scheduled class is checked by the API, not by a database trigger.
- The real UCC room schedules (23 photographed timetables) have not been loaded yet. Sample data is fictional.
- Supabase Auth settings (email confirmation, password rules, providers) are still the project defaults. Review them in the dashboard before real users sign up.
- `supabase/config.toml` is a minimal placeholder. Run `npx supabase init` if you want the CLI's full file.
- The 3D Congress Building prototype in `docs/prototypes/` is a standalone page, not yet part of the React app. The sample classrooms use its room ids, but real UCC rooms are not loaded yet.
