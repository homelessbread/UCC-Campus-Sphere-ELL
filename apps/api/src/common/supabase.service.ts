import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../config';
import { APP_CONFIG } from './tokens';

/**
 * The one and only database access layer. It talks to Supabase with the SECRET key, so it bypasses Row Level
 * Security. That is why every route that reaches it is behind the auth and role guards.
 */
@Injectable()
export class SupabaseService {
  private cached?: SupabaseClient;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.supabaseUrl && this.config.supabaseSecretKey);
  }

  get client(): SupabaseClient {
    if (!this.config.supabaseUrl || !this.config.supabaseSecretKey) {
      throw new ServiceUnavailableException(
        'The server is not connected to Supabase. Set SUPABASE_URL and SUPABASE_SECRET_KEY in apps/api/.env.',
      );
    }
    this.cached ??= createClient(this.config.supabaseUrl, this.config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.cached;
  }
}
