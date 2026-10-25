# UCC CampusSphere

**3D Campus Navigation and Classroom Scheduling System. Explore. Locate. Learn.**

Students, teachers, and administrators can explore the campus in 3D, view classroom schedules, and find rooms that are available for a requested period. Availability is calculated from database records and is schedule-based: an unscheduled room does not guarantee that nobody is inside it.

**Live Website:** [Browse UCC CampusSphere](https://ucc-campus-sphere-ell-s924.vercel.app)

## Website Preview

### Front Page

![UCC CampusSphere Front Page](screenshots/frontpage.jpg)

### 3D UCC Congress Campus Model

![3D UCC Congress Campus Model](screenshots/3d campus.jpg)

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5 |
| 3D | Three.js, React Three Fiber, Drei, GLB/glTF models from Blender |
| Backend | Node.js, NestJS 11, TypeScript, REST, class-validator |
| Cloud | Supabase (PostgreSQL, Auth, RLS, Storage) |
| Tooling | npm workspaces, ESLint 9, Prettier, Jest, Supertest |

**Package Manager:** npm workspaces. TypeScript is pinned to version 5.9 through `overrides` for compatibility with the shared package's `node10` module resolution.

## Repository Structure

```text
ucc-campussphere/
├── apps/
│   ├── api/            NestJS API
│   └── web/             React + Vite app
├── packages/
│   └── shared/          Shared types and constants
├── supabase/            Database migrations and configuration
├── assets/3d-models/    GLB models
├── docs/prototypes/     Standalone 3D building prototype
├── screenshots/         Website screenshots
├── .env.example         Environment variable template
└── package.json         Workspace root and scripts
```
