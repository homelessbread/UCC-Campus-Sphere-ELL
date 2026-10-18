import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Parses KEY=VALUE lines. Ignores blanks and # comments, strips matching quotes. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** Loads apps/api/.env into process.env. Variables already set in the environment win. */
export function loadEnvFile(path = join(__dirname, '..', '.env')): void {
  if (!existsSync(path)) return;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
