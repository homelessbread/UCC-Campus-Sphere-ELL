import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { AuthGuard, RolesGuard } from '../auth/guards';
import { AppConfig, loadConfig } from '../config';
import { AuditService } from './audit.service';
import { AllExceptionsFilter } from './http-exception.filter';
import { SupabaseService } from './supabase.service';
import { APP_CONFIG } from './tokens';

/** Global building blocks: config, the single database layer, auth, and the two guards applied to every route. */
@Global()
@Module({
  // Public pages need no sign-in, so every caller is rate limited by IP: 120 requests a minute.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  providers: [
    { provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() },
    SupabaseService,
    AuditService,
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [APP_CONFIG, SupabaseService, AuditService, AuthService],
})
export class CommonModule {}
