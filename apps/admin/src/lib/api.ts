import { API_PREFIX, type HealthResponse } from '@ucc/shared';
import { supabase } from './supabase';

// Empty in development (Vite proxies /api). Set VITE_API_URL to the deployed API origin in production.
const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {}))
    if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${base}/${API_PREFIX}${path}${qs.size ? `?${qs}` : ''}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }).catch(() => {
    throw new ApiError('Cannot reach the server. Check that the API is running.', 0);
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // An HTML page came back instead of data: the site is not pointed at a running API.
    throw new ApiError(
      'The website could not reach the API (it got a web page instead of data). Start the API, or set VITE_API_URL to its address.',
      res.status,
    );
  }
  if (!res.ok) {
    const m = json?.message;
    throw new ApiError(
      Array.isArray(m) ? m.join(' ') : (m ?? `Request failed (${res.status}).`),
      res.status,
      json?.details,
    );
  }
  return json as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${base}/${API_PREFIX}/health?check=db`);
  if (!res.ok) {
    throw new Error(
      res.status >= 500
        ? `No working API answered (HTTP ${res.status}).`
        : `The API answered with HTTP ${res.status}.`,
    );
  }
  return (await res.json()) as HealthResponse;
}

/** List endpoints return { data, total }. */
export const list = (path: string, query: Record<string, string | number | undefined> = {}) =>
  api<{ data: any[]; total: number }>(path, { query: { limit: 500, ...query } }).then(
    (r) => r.data,
  );

export const manilaNow = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16);
/** Turns a datetime-local value (school time) into an ISO string with the +08:00 offset. */
export const toManilaIso = (v: string) => (v.length === 16 ? `${v}:00+08:00` : v);
/** Turns an ISO instant into a datetime-local value in school time. */
export const fromIso = (iso: string) =>
  new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16);
