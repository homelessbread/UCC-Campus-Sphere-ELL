# UCC CampusSphere

**3D Campus Navigation and Classroom Scheduling System. Explore. Locate. Learn.**

Students, teachers and administrators explore the campus in 3D, view classroom schedules and find rooms
that are free for a requested period. Availability is calculated from database records and is
schedule-based: an unscheduled room is not proof that nobody is inside it.


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

