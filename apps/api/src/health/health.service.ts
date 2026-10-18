import { Inject, Injectable } from '@nestjs/common';
import { HealthResponse, SCHOOL_TIME_ZONE } from '@ucc/shared';
import { AppConfig } from '../config';
import { SupabaseService } from '../common/supabase.service';
import { APP_CONFIG } from '../common/tokens';

@Injectable()
export class HealthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly supabase: SupabaseService,
  ) {}

  /** With testConnection, runs one real query against Supabase. It reports 'ok' only if that query succeeded. */
  async check(testConnection: boolean): Promise<HealthResponse> {
    const configured = Boolean(this.config.supabaseUrl && this.config.supabaseSecretKey);
    let connection: HealthResponse['supabase']['connection'] = 'not_tested';
    if (testConnection && configured) {
      try {
        const { error } = await this.supabase.client
          .from('campuses')
          .select('id', { head: true, count: 'exact' });
        connection = error ? 'failed' : 'ok';
      } catch {
        connection = 'failed';
      }
    }
    return {
      status: 'ok',
      service: 'ucc-campussphere-api',
      version: process.env.npm_package_version ?? '0.1.0',
      time: new Date().toISOString(),
      schoolTimeZone: SCHOOL_TIME_ZONE,
      supabase: { configured, connection },
    };
  }
}
