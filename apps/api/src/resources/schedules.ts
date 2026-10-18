import {
  BadRequestException,
  Body,
  ConflictException,
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
import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { PublicRead } from '../auth/public-read';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { SupabaseService } from '../common/supabase.service';

// Generated from one field spec per resource. Field names match the database columns (snake_case).
const pad = (t: string) => (t.length === 5 ? `${t}:00` : t);
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateScheduleDto {
  @IsUUID()
  section_id!: string;

  @IsUUID()
  classroom_id!: string;

  @IsOptional()
  @IsUUID()
  teacher_id?: string;

  @IsInt()
  @Min(1)
  @Max(7)
  day_of_week!: number;

  @Matches(TIME, { message: (args) => `${args.property} must look like HH:MM` })
  start_time!: string;

  @Matches(TIME, { message: (args) => `${args.property} must look like HH:MM` })
  end_time!: string;

  @Matches(DATE, { message: (args) => `${args.property} must look like YYYY-MM-DD` })
  valid_from!: string;

  @Matches(DATE, { message: (args) => `${args.property} must look like YYYY-MM-DD` })
  valid_to!: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}
export class UpdateScheduleDto extends PartialType(CreateScheduleDto) {}

@Injectable()
export class SchedulesService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'class_schedules',
      entity: 'class schedule',
      filters: ['section_id', 'classroom_id', 'teacher_id', 'day_of_week', 'status'],
      orderBy: 'day_of_week',
    });
  }

  protected override createdBy(actor: AuthUser): object {
    return { created_by: actor.id };
  }

  override async create(dto: object, actor: AuthUser) {
    const d = dto as CreateScheduleDto;
    this.validate(d);
    try {
      return await super.create(dto, actor);
    } catch (e) {
      if (e instanceof ConflictException) throw await this.withConflicts(e, d);
      throw e;
    }
  }

  /** Adds the clashing schedules to a 409 so the admin screen can show exactly what is in the way. */
  private async withConflicts(
    original: ConflictException,
    d: CreateScheduleDto,
  ): Promise<ConflictException> {
    const or = `classroom_id.eq.${d.classroom_id}${d.teacher_id ? `,teacher_id.eq.${d.teacher_id}` : ''}`;
    const { data } = await this.db.client
      .from('class_schedules')
      .select(
        'id, section_id, classroom_id, teacher_id, day_of_week, start_time, end_time, valid_from, valid_to',
      )
      .eq('status', 'active')
      .eq('day_of_week', d.day_of_week)
      .lte('valid_from', d.valid_to)
      .gte('valid_to', d.valid_from)
      .lt('start_time', d.end_time)
      .gt('end_time', d.start_time)
      .or(or);
    const conflicts = (data ?? []).map((r) => ({
      schedule_id: r.id,
      section_id: r.section_id,
      same_room: r.classroom_id === d.classroom_id,
      same_teacher: Boolean(d.teacher_id) && r.teacher_id === d.teacher_id,
      day_of_week: r.day_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
    }));
    if (!conflicts.length) return original;
    const body = original.getResponse() as { message?: string };
    return new ConflictException({
      message: body.message ?? original.message,
      error: 'Conflict',
      details: { conflicts },
    });
  }

  private validate(d: CreateScheduleDto): void {
    if (pad(d.start_time) >= pad(d.end_time))
      throw new BadRequestException('end_time must be later than start_time.');
    if (d.valid_to < d.valid_from)
      throw new BadRequestException('valid_to must not be before valid_from.');
  }
}

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

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
  create(@Body() dto: CreateScheduleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
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
