import {
  BadRequestException,
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
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { fetchAll } from '../common/paging';
import { SupabaseService } from '../common/supabase.service';
import { addDays, localParts } from '../scheduling/time';

// Generated from one field spec per resource. Field names match the database columns (snake_case).

export class CreateMaintenanceBlockDto {
  @IsUUID()
  classroom_id!: string;

  @IsISO8601({ strict: true })
  starts_at!: string;

  @IsISO8601({ strict: true })
  ends_at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
export class UpdateMaintenanceBlockDto extends PartialType(CreateMaintenanceBlockDto) {}

@Injectable()
export class MaintenanceBlocksService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'maintenance_blocks',
      entity: 'maintenance block',
      filters: ['classroom_id'],
      orderBy: 'starts_at',
    });
  }

  protected override createdBy(actor: AuthUser): object {
    return { created_by: actor.id };
  }

  override async create(dto: object, actor: AuthUser) {
    this.validate(dto as CreateMaintenanceBlockDto);
    const row = (await super.create(dto, actor)) as Record<string, unknown>;
    return this.withAffectedClasses(row);
  }

  override async update(id: string, dto: object, actor: AuthUser) {
    const row = (await super.update(id, dto, actor)) as Record<string, unknown>;
    return this.withAffectedClasses(row);
  }

  /**
   * Maintenance is allowed to be added even when classes are already scheduled (a burst pipe does not wait for the
   * timetable). The response lists the class meetings it disrupts so the admin can move or cancel them.
   * Until then, availability treats the room as under maintenance during the block.
   */
  private async withAffectedClasses(row: Record<string, unknown>) {
    const startMs = Date.parse(String(row.starts_at));
    const endMs = Date.parse(String(row.ends_at));
    const from = localParts(startMs).date;
    const to = localParts(endMs - 1).date;
    const days = Math.min(
      62,
      Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000),
    );
    const occ = await fetchAll<{
      schedule_id: string;
      classroom_id: string;
      occ_date: string;
      starts_at: string;
      ends_at: string;
      subject_code: string;
      section_code: string;
    }>((a, b) =>
      this.db.client
        .rpc('class_occurrences', { p_from: from, p_to: addDays(from, days) })
        .range(a, b),
    );
    const affected = occ
      .filter(
        (o) =>
          o.classroom_id === row.classroom_id &&
          Date.parse(o.starts_at) < endMs &&
          Date.parse(o.ends_at) > startMs,
      )
      .map((o) => ({
        schedule_id: o.schedule_id,
        label: `${o.subject_code} ${o.section_code}`,
        date: o.occ_date,
        starts_at: o.starts_at,
        ends_at: o.ends_at,
      }));
    return {
      ...row,
      affected_classes: affected,
      ...(affected.length
        ? {
            warning: `${affected.length} scheduled class meeting(s) fall inside this block. Move or cancel them.`,
          }
        : {}),
    };
  }

  private validate(d: CreateMaintenanceBlockDto): void {
    if (Date.parse(d.ends_at) <= Date.parse(d.starts_at))
      throw new BadRequestException('ends_at must be later than starts_at.');
  }
}

@Controller('maintenance-blocks')
export class MaintenanceBlocksController {
  constructor(private readonly service: MaintenanceBlocksService) {}

  @Roles('admin')
  @Get()
  list(@Query() query: RawQuery) {
    return this.service.list(query);
  }

  @Roles('admin')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateMaintenanceBlockDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceBlockDto,
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
