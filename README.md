# UCC CampusSphere

**3D Campus Navigation and Classroom Scheduling System. Explore. Locate. Learn.**

Students, teachers, and administrators can explore the campus in 3D, view classroom schedules, and find rooms that are available for a requested period. Availability is calculated from database records and is schedule-based: an unscheduled room does not guarantee that nobody is inside it.

**Live Website:** [UCC CampusSphere](https://ucc-campus-sphere-ell-s924.vercel.app)

## Website Preview

### Front Page

![UCC CampusSphere Front Page](<img width="1898" height="924" alt="Image" src="https://github.com/user-attachments/assets/b1de8e4c-75df-4327-9dbe-3d77aeac2eef" />)

### 3D UCC Congress Campus Model

![3D UCC Congress Campus Model](<img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/f27f9e69-718d-40c0-b7a7-149931aaf220" />)

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
