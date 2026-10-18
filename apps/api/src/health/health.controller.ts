import { Controller, Get, Query } from '@nestjs/common';
import { HealthResponse } from '@ucc/shared';
import { Public } from '../auth/decorators';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Public. Add ?check=db to also run a real Supabase query. */
  @Public()
  @Get()
  check(@Query('check') check?: string): Promise<HealthResponse> {
    return this.health.check(check === 'db');
  }
}
