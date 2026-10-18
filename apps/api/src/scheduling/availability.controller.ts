import { Throttle } from '@nestjs/throttler';
import { PublicRead } from '../auth/public-read';
import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { AvailabilityService } from './availability.service';

const EQUIPMENT = /^[a-z0-9_]+(:\d{1,4})?(,[a-z0-9_]+(:\d{1,4})?)*$/i;
const FLEX_TIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

export class StatusQueryDto {
  /** Instant to evaluate. Default: now. Without Z or an offset it is read as school time (Asia/Manila). */
  @IsOptional()
  @Matches(FLEX_TIME, { message: 'at must be an ISO 8601 date and time' })
  at?: string;
  @IsOptional() @IsUUID() building_id?: string;
  @IsOptional() @IsUUID() floor_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-5) @Max(60) floor_level?: number;
}

export class SearchQueryDto {
  /** now = free this moment, 30 / 60 = free without interruption for that long, custom = start plus end or duration. */
  @IsOptional() @IsIn(['now', '30', '60', 'custom']) preset?: 'now' | '30' | '60' | 'custom';
  @IsOptional()
  @Matches(FLEX_TIME, { message: 'start must be an ISO 8601 date and time' })
  start?: string;
  @IsOptional()
  @Matches(FLEX_TIME, { message: 'end must be an ISO 8601 date and time' })
  end?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720) duration_minutes?: number;

  @IsOptional() @IsUUID() building_id?: string;
  @IsOptional() @IsUUID() floor_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-5) @Max(60) floor_level?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2000) min_capacity?: number;
  /** Room type code, for example lab or comlab. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9_]+$/i) category?: string;
  /** Comma list of equipment codes, each optionally with a minimum quantity: projector,computers:25 */
  @IsOptional()
  @Matches(EQUIPMENT, { message: 'equipment must look like projector,computers:25' })
  equipment?: string;

  @IsOptional() @IsUUID() preferred_building_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-5) @Max(60) preferred_floor_level?: number;
  @IsOptional() @IsIn(['true', 'false']) include_unavailable?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  /** Every room with its schedule-based status at one instant. Feeds the dashboard and the 3D colouring. */
  @PublicRead()
  @Get('status')
  status(@Query() q: StatusQueryDto) {
    return this.service.status(q);
  }

  /** The Smart Room Finder: rooms free for a whole interval that meet the filters, ranked and explained. */
  @PublicRead()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('search')
  search(@Query() q: SearchQueryDto) {
    return this.service.search(q);
  }
}
