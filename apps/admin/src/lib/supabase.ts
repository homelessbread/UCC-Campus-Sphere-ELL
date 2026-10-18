import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key && !key.startsWith('your-'));

// Sign-in only. All data goes through the API with the access token as a Bearer header.
export const supabase = createClient(url ?? 'https://not-configured.invalid', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});
