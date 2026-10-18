import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { supabase } from './supabase';

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: 'admin' | 'user';
}
interface Ctx {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}
const AuthCtx = createContext<Ctx>(null as never);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setMe(null);
        setLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<Me>('/me')
      .then((m) => {
        setMe(m);
        setError(null);
      })
      .catch((e) => {
        setMe(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AuthCtx.Provider
      value={{
        session,
        me,
        loading,
        error,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
