import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { btn, Field, inputCls } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase, supabaseConfigured } from '../lib/supabase';

const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? '';

export default function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    const r = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (r.error) setError(r.error.message);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="font-heading text-sm text-ucc-orange">Administration</p>
          <h1 className="font-heading text-3xl font-bold text-ucc-deep">UCC CampusSphere</h1>
        </div>
        <form
          onSubmit={submit}
          noValidate
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <h2 className="font-heading mb-4 text-lg font-semibold">Administrator sign in</h2>
          {!supabaseConfigured && (
            <p className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Sign-in is not set up. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to
              apps/admin/.env, then restart.
            </p>
          )}
          <Field label="Email">
            {(id) => (
              <input
                id={id}
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            )}
          </Field>
          <Field label="Password">
            {(id) => (
              <input
                id={id}
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <button className={`${btn.primary} w-full`} disabled={busy}>
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
          <p className="mt-4 text-center text-xs text-slate-500">
            Accounts are created by an existing administrator. Looking for schedules and rooms?{' '}
            {PUBLIC_URL ? (
              <a className="underline" href={PUBLIC_URL}>
                Go to the public site
              </a>
            ) : (
              'Use the public site.'
            )}
          </p>
        </form>
      </div>
    </main>
  );
}
