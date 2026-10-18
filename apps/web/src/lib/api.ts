import { API_PREFIX, type HealthResponse } from '@ucc/shared';

// Empty in development (Vite proxies /api). Set VITE_API_URL to the deployed API origin in production.
const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Read-only calls to the public API. No sign-in, no tokens: this site only ever reads. */
export async function api<T = any>(
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${base}/${API_PREFIX}${path}${qs.size ? `?${qs}` : ''}`).catch(() => {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
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
      res.status === 429
        ? 'Too many requests. Wait a minute and try again.'
        : Array.isArray(m)
          ? m.join(' ')
          : (m ?? `Request failed (${res.status}).`),
      res.status,
    );
  }
  return json as T;
}

export const list = (path: string, query: Record<string, string | number | undefined> = {}) =>
  api<{ data: any[]; total: number }>(path, { limit: 500, ...query }).then((r) => r.data);

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
