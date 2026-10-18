export interface AppConfig {
  port: number;
  corsOrigins: string[];
  supabaseUrl?: string;
  supabaseSecretKey?: string;
}

/** Reads and validates the environment once. Throws a clear message on a bad value. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${rawPort}".`);
  }
  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    port,
    corsOrigins,
    supabaseUrl: env.SUPABASE_URL?.trim() || undefined,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY?.trim() || undefined,
  };
}
