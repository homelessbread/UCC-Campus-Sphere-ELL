import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../lib/api';

export default function StatusPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm font-medium text-accent-text">Explore. Locate. Learn.</p>
        <h1 className="font-heading mt-1 text-3xl font-bold text-ink">UCC CampusSphere</h1>
        <p className="mt-1 text-ink-soft">3D Campus Navigation and Classroom Scheduling System</p>
      </header>

      <section aria-live="polite" className="neo p-5">
        <h2 className="text-lg font-semibold text-ink">Backend connection</h2>

        {health.isPending && <p className="mt-3 text-ink-soft">Checking the API...</p>}

        {health.isError && (
          <div className="mt-3 rounded-md bg-danger-bg p-3 text-danger">
            <p className="font-medium">The API is not reachable.</p>
            <p className="mt-1 text-sm">
              {health.error.message} Start it with <code>npm run dev:api</code> and try again.
            </p>
          </div>
        )}

        {health.isSuccess && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-mute">Status</dt>
            <dd className="font-medium text-ok">{health.data.status}</dd>
            <dt className="text-ink-mute">Service</dt>
            <dd>{health.data.service}</dd>
            <dt className="text-ink-mute">Version</dt>
            <dd>{health.data.version}</dd>
            <dt className="text-ink-mute">Server time (UTC)</dt>
            <dd>{health.data.time}</dd>
            <dt className="text-ink-mute">School time zone</dt>
            <dd>{health.data.schoolTimeZone}</dd>
            <dt className="text-ink-mute">Supabase variables</dt>
            <dd>{health.data.supabase.configured ? 'set on the server' : 'not set yet'}</dd>
            <dt className="text-ink-mute">Supabase connection</dt>
            <dd>
              {
                {
                  ok: 'connected (a real query succeeded)',
                  failed: 'failed (check the server URL and secret key)',
                  not_tested: 'not tested',
                }[health.data.supabase.connection]
              }
            </dd>
          </dl>
        )}

        <button
          type="button"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
          className="mt-4 rounded-md bg-ucc-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {health.isFetching ? 'Checking...' : 'Check again'}
        </button>
      </section>
    </main>
  );
}
