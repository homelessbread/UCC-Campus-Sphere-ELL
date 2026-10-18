import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { PublicRead } from '../auth/public-read';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { SupabaseService } from '../common/supabase.service';

// Generated from one field spec per resource. Field names match the database columns (snake_case).
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateScheduleExceptionDto {
  @IsUUID()
  schedule_id!: string;

  @Matches(DATE, { message: (args) => `${args.property} must look like YYYY-MM-DD` })
  exception_date!: string;

  @IsOptional()
  @IsUUID()
  classroom_id?: string;

  @IsOptional()
  @Matches(TIME, { message: (args) => `${args.property} must look like HH:MM` })
  start_time?: string;

  @IsOptional()
  @Matches(TIME, { message: (args) => `${args.property} must look like HH:MM` })
  end_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
export class UpdateScheduleExceptionDto extends PartialType(CreateScheduleExceptionDto) {}

@Injectable()
export class ScheduleExceptionsService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'schedule_exceptions',
      entity: 'schedule exception',
      filters: ['schedule_id', 'classroom_id', 'exception_date'],
      orderBy: 'exception_date',
    });
  }

  protected override createdBy(actor: AuthUser): object {
    return { created_by: actor.id };
  }
}

@Controller('schedule-exceptions')
export class ScheduleExceptionsController {
  constructor(private readonly service: ScheduleExceptionsService) {}

  @PublicRead()
  @Get()
  list(@Query() query: RawQuery) {
    return this.service.list(query);
  }

  @PublicRead()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateScheduleExceptionDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleExceptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
