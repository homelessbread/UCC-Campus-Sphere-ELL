import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { loadConfig } from '../config';
import { configureApp } from '../configure-app';
import { HealthController } from './health.controller';
import { APP_CONFIG } from '../common/tokens';
import { SupabaseService } from '../common/supabase.service';
import { HealthService } from './health.service';

async function makeApp(env: NodeJS.ProcessEnv, supabase?: unknown): Promise<INestApplication> {
  const config = loadConfig(env);
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: APP_CONFIG, useValue: config },
      { provide: SupabaseService, useValue: supabase ?? new SupabaseService(config) },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, config);
  await app.init();
  return app;
}

describe('GET /api/health', () => {
  let app: INestApplication;
  afterEach(async () => app?.close());

  it('returns ok with the expected shape and never leaks secrets', async () => {
    app = await makeApp({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_abc',
    });
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'ucc-campussphere-api',
      schoolTimeZone: 'Asia/Manila',
      supabase: { configured: true, connection: 'not_tested' },
    });
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('sb_secret_abc');
  });

  it('reports supabase as not configured when variables are missing', async () => {
    app = await makeApp({});
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.supabase.configured).toBe(false);
  });

  it('does not test the connection unless asked, and reports ok or failed from a real query result', async () => {
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'k' };
    const fake = (error: unknown) => ({
      client: { from: () => ({ select: () => Promise.resolve({ error }) }) },
    });
    app = await makeApp(env, fake(null));
    const shallow = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(shallow.body.supabase.connection).toBe('not_tested');
    const ok = await request(app.getHttpServer()).get('/api/health?check=db').expect(200);
    expect(ok.body.supabase.connection).toBe('ok');
    await app.close();
    app = await makeApp(env, fake({ message: 'boom' }));
    const bad = await request(app.getHttpServer()).get('/api/health?check=db').expect(200);
    expect(bad.body.supabase.connection).toBe('failed');
    expect(JSON.stringify(bad.body)).not.toContain('boom');
  });

  it('allows only the configured CORS origin', async () => {
    app = await makeApp({ CORS_ORIGINS: 'http://localhost:5173' });
    const ok = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects an invalid PORT with a clear message', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT must be an integer/);
  });
});
