import { useAuth } from '../lib/auth';

const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? '';

export default function UserHome() {
  const { me, signOut } = useAuth();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold text-ucc-deep">
        This account is not an administrator
      </h1>
      <p className="mt-2 text-slate-600">
        {me?.email} can sign in, but only administrators can use this site. Class schedules, room
        availability, teachers and subjects are open to everyone on the public site.
      </p>
      {PUBLIC_URL && (
        <a
          href={PUBLIC_URL}
          className="mt-4 inline-block text-sm font-medium text-ucc-navy underline"
        >
          Go to the public site
        </a>
      )}
      <button onClick={signOut} className="mt-4 ml-4 text-sm font-medium text-ucc-navy underline">
        Sign out
      </button>
    </main>
  );
}
