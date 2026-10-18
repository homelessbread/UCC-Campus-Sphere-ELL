# Deploying UCC CampusSphere

Three small projects from this one repository, all on Vercel's free tier, plus your existing Supabase database.

| Project              | Folder                     | Who uses it                   | Example address                              |
| -------------------- | -------------------------- | ----------------------------- | -------------------------------------------- |
| Public site          | `apps/web`                 | Everyone. No sign-in.         | `campussphere.vercel.app` or your own domain |
| Admin site           | `apps/admin`               | Administrators only           | `admin.yourdomain.com`                       |
| API                  | `apps/api`                 | Both sites                    | `campussphere-api.vercel.app`                |
| Database and sign-in | Supabase (already running) | The API and the admin sign-in | no change                                    |

Nothing in the database is touched by this change. Your records stay where they are.

## How access works

- **Public pages** call read-only API routes that need no token: buildings, floors, classrooms, teachers, subjects, sections, terms, schedules, holidays, room availability, room finder, timetable. These routes hide emails, employee numbers, author ids and maintenance reasons. Each visitor is limited to 120 requests a minute (30 for the room finder).
- **Changing anything** (every POST, PATCH, PUT, DELETE), the dashboard, user management, maintenance records and the schedule pre-check all need a valid sign-in token **and** the admin role. The API checks the role in the database on every request. Hiding a button or a page in the browser is never what protects anything.
- **The browser never talks to the database directly.** The database only accepts the API's secret key for data. The public site has no Supabase code at all.

## Before you deploy (once)

1. Push the repository to GitHub.
2. In the Supabase dashboard open **Authentication**, then **Sign In / Providers**, and turn **off** "Allow new users to sign up". Only the admin site signs people in, and accounts are created by hand, so nobody needs to register.
3. In **Authentication → URL Configuration** set **Site URL** to the admin site address (for example `https://admin.yourdomain.com`), so password and confirmation emails link to the right place.
4. Create your administrator: **Authentication → Users → Add user** (tick auto confirm), then in the SQL editor run:
   `update public.user_roles set role = 'admin' where user_id = (select id from auth.users where email = 'you@example.com');`
5. Make sure migrations 1 to 5 have been run. Run `supabase/migrations/20261016000005_schedule_precheck.sql` if you have not.

## 1. The API

1. Vercel dashboard → **Add New → Project** → import the repository.
2. **Root Directory:** `apps/api`. Leave "Include source files outside of the Root Directory" **on**. The `vercel.json` in that folder supplies the install and build commands.
3. **Environment Variables:**
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_SECRET_KEY` = your secret key (server only, never in the two websites)
   - `CORS_ORIGINS` = the two site addresses, comma separated, no spaces, no trailing slash. For example `https://campussphere.vercel.app,https://admin.yourdomain.com`
   - `NODE_ENV` = `production`
4. Deploy. Open `https://<your-api>/api/health`: it should say `"status":"ok"` and `"connection":"ok"` when you add `?check=db`.

The API is bundled into one serverless function. If you would rather run it as a normal Node server (Render, Railway, Fly), use build command `npm install && npm run build:shared && npm run build -w @ucc/api` and start command `npm run start -w @ucc/api`, with the same environment variables. Free servers on those hosts sleep when idle, so the first request after a pause is slow.

## 2. The public site

1. **Add New → Project**, same repository. **Root Directory:** `apps/web`.
2. **Environment Variable:** `VITE_API_URL` = the API address, for example `https://campussphere-api.vercel.app` (no trailing slash).
3. Deploy. Add your own domain under **Settings → Domains** if you have one.

## 3. The admin site

1. **Add New → Project**, same repository. **Root Directory:** `apps/admin`.
2. **Environment Variables:**
   - `VITE_API_URL` = the API address
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your publishable key (this one is meant to be public)
   - `VITE_PUBLIC_SITE_URL` = the public site address (shown as a link on the sign-in page)
3. Deploy, then **Settings → Domains** and add `admin.yourdomain.com`. At your domain registrar add a CNAME record named `admin` pointing to `cname.vercel-dns.com` (Vercel shows the exact value).
4. Add the admin address to `CORS_ORIGINS` on the API if you have not, then redeploy the API (environment variable changes only apply to new deployments).

The admin site sends `noindex` headers, a `robots.txt` that disallows everything, and refuses to be embedded in other pages.

## Check it worked

From the repository folder, with the API address:

```
set API_URL=https://campussphere-api.vercel.app
set EXPECT_CORS_ORIGIN=https://campussphere.vercel.app
npm run verify:public
```

(On macOS or Linux use `export` instead of `set`.) It expects every public page to load without a token, every write and admin route to answer 401, private fields to be hidden, and only your two sites to be allowed by CORS. Then open the admin site, sign in, and open Users and Class schedules.

## What was not tested here

The Vercel setup could not be run from the build environment, which cannot reach Vercel or Supabase. I tested the pieces it relies on: the API bundle answering requests the way Vercel calls it, the two website builds, and the public pages and admin sign-in guards in a headless browser against mock data. The first real deployment is the real test, and `verify:public` is the quick check for it.

## Costs and limits to know

Vercel and Supabase free tiers are enough for a school project but have usage caps, and Supabase free projects pause after a week without activity. A pause makes every page show an error until you resume the project in the Supabase dashboard.
