import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { PublicRead } from '../auth/public-read';
import { AuditService } from '../common/audit.service';
import { dbError } from '../common/db-error';
import { SupabaseService } from '../common/supabase.service';
import { AvailabilityService } from '../scheduling/availability.service';

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (t: string) => (t.length === 5 ? `${t}:00` : t);
const BASIS =
  'Based on recorded schedules, holidays and maintenance blocks. It is not a check of who is physically in a room.';

export class UpdateUserDto {
  @IsOptional() @IsIn(['admin', 'user']) role?: 'admin' | 'user';
  @IsOptional() @IsIn(['active', 'suspended']) status?: 'active' | 'suspended';
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) full_name?: string;
}

export class CheckScheduleDto {
  @IsUUID() section_id!: string;
  @IsUUID() classroom_id!: string;
  @IsOptional() @IsUUID() teacher_id?: string;
  @IsInt() @Min(1) @Max(7) day_of_week!: number;
  @Matches(TIME) start_time!: string;
  @Matches(TIME) end_time!: string;
  @Matches(DATE) valid_from!: string;
  @Matches(DATE) valid_to!: string;
  @IsOptional() @IsUUID() exclude_schedule_id?: string;
}

export class TimetableQueryDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
  @IsOptional() @IsUUID() classroom_id?: string;
  @IsOptional() @IsUUID() teacher_id?: string;
  @IsOptional() @IsUUID() section_id?: string;
}

export class EquipmentTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(32) @Matches(/^[a-z0-9_]+$/) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
}
export class UpdateEquipmentTypeDto extends PartialType(EquipmentTypeDto) {}

export class RoomEquipmentDto {
  @IsUUID() classroom_id!: string;
  @IsUUID() equipment_type_id!: string;
  @IsInt() @Min(1) @Max(1000) quantity!: number;
}
export class RoomEquipmentKeyDto {
  @IsUUID() classroom_id!: string;
  @IsUUID() equipment_type_id!: string;
}
export class SubjectRequirementDto {
  @IsUUID() subject_id!: string;
  @IsUUID() equipment_type_id!: string;
  @IsInt() @Min(1) @Max(1000) min_quantity!: number;
}
export class SubjectRequirementKeyDto {
  @IsUUID() subject_id!: string;
  @IsUUID() equipment_type_id!: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: SupabaseService,
    private readonly audit: AuditService,
    private readonly availability: AvailabilityService,
  ) {}

  private async count(table: string, filter?: (q: any) => any): Promise<number> {
    let q: any = this.db.client.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) throw dbError(error);
    return count ?? 0;
  }

  async dashboard(now = new Date()) {
    const today = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    const [buildings, floors, classrooms, teachers, schedules, status, activity] =
      await Promise.all([
        this.count('buildings'),
        this.count('floors'),
        this.count('classrooms'),
        this.count('teachers', (q) => q.eq('is_active', true)),
        this.count('class_schedules', (q) => q.eq('status', 'active')),
        this.availability.status({}),
        this.db.client
          .from('audit_logs')
          .select('id,actor_id,action,entity,entity_id,created_at')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
    if (activity.error) throw dbError(activity.error);
    const rows = activity.data ?? [];
    const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data } = await this.db.client
        .from('profiles')
        .select('id,email,full_name')
        .in('id', ids);
      for (const p of data ?? []) names.set(p.id, p.full_name || p.email);
    }
    const occ = await this.db.client.rpc('class_occurrences', { p_from: today, p_to: today });
    if (occ.error) throw dbError(occ.error);
    return {
      at: status.at,
      basis: BASIS,
      totals: {
        buildings,
        floors,
        classrooms,
        active_teachers: teachers,
        scheduled_classes: schedules,
        classes_today: (occ.data ?? []).length,
      },
      rooms: {
        available: status.counts.free,
        occupied_by_schedule: status.counts.occupied,
        under_maintenance: status.counts.maintenance,
        inactive: status.counts.inactive,
        items: status.rooms,
      },
      recent_activity: rows.map((r) => ({
        ...r,
        actor: r.actor_id ? (names.get(r.actor_id) ?? null) : null,
      })),
    };
  }

  async listUsers() {
    const { data: profiles, error } = await this.db.client
      .from('profiles')
      .select('id,email,full_name,status,created_at')
      .order('created_at', { ascending: true });
    if (error) throw dbError(error);
    const { data: roles, error: e2 } = await this.db.client
      .from('user_roles')
      .select('user_id,role');
    if (e2) throw dbError(e2);
    const byUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return {
      data: (profiles ?? []).map((p) => ({ ...p, role: byUser.get(p.id) ?? 'user' })),
      total: profiles?.length ?? 0,
    };
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: AuthUser) {
    if (!dto.role && !dto.status && !dto.full_name)
      throw new BadRequestException('Nothing to update.');
    if (id === actor.id && (dto.role || dto.status))
      throw new ForbiddenException('You cannot change your own role or status.');
    const { data: target, error } = await this.db.client
      .from('profiles')
      .select('id,status')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!target) throw new NotFoundException('User not found.');
    const { data: cur } = await this.db.client
      .from('user_roles')
      .select('role')
      .eq('user_id', id)
      .maybeSingle();
    const losesAdmin =
      cur?.role === 'admin' &&
      target.status === 'active' &&
      (dto.role === 'user' || dto.status === 'suspended');
    if (losesAdmin) {
      const { data: admins } = await this.db.client
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      const ids = (admins ?? []).map((a) => a.user_id);
      const { count } = await this.db.client
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .in('id', ids)
        .eq('status', 'active');
      if ((count ?? 0) <= 1)
        throw new ForbiddenException('At least one active administrator must remain.');
    }
    if (dto.full_name || dto.status) {
      const patch: Record<string, string> = {};
      if (dto.full_name) patch.full_name = dto.full_name;
      if (dto.status) patch.status = dto.status;
      const r = await this.db.client.from('profiles').update(patch).eq('id', id);
      if (r.error) throw dbError(r.error);
    }
    if (dto.role) {
      const r = await this.db.client
        .from('user_roles')
        .upsert({ user_id: id, role: dto.role, updated_by: actor.id }, { onConflict: 'user_id' });
      if (r.error) throw dbError(r.error);
    }
    await this.audit.record(actor.id, 'update', 'user', id, { values: dto });
    const list = await this.listUsers();
    return list.data.find((u) => u.id === id);
  }

  async checkSchedule(dto: CheckScheduleDto) {
    if (dto.start_time >= dto.end_time && pad(dto.start_time) >= pad(dto.end_time)) {
      return {
        ok: false,
        problems: [
          {
            severity: 'error',
            code: 'UC009',
            message: 'The end time must be later than the start time.',
            related_schedule_id: null,
          },
        ],
      };
    }
    const { data, error } = await this.db.client.rpc('check_class_schedule', {
      p_section: dto.section_id,
      p_classroom: dto.classroom_id,
      p_teacher: dto.teacher_id ?? null,
      p_day: dto.day_of_week,
      p_start: pad(dto.start_time),
      p_end: pad(dto.end_time),
      p_from: dto.valid_from,
      p_to: dto.valid_to,
      p_exclude: dto.exclude_schedule_id ?? null,
    });
    if (error) throw dbError(error);
    const problems = (data ?? []) as { severity: string }[];
    return { ok: !problems.some((p) => p.severity === 'error'), problems };
  }

  async timetable(q: TimetableQueryDto, isAdmin = false) {
    const { data, error } = await this.db.client.rpc('class_occurrences', {
      p_from: q.from,
      p_to: q.to,
    });
    if (error) throw dbError(error);
    let rows = (data ?? []) as any[];
    if (q.classroom_id) rows = rows.filter((r) => r.classroom_id === q.classroom_id);
    if (q.teacher_id) rows = rows.filter((r) => r.teacher_id === q.teacher_id);
    if (q.section_id) rows = rows.filter((r) => r.section_id === q.section_id);
    const rooms = await this.db.client.from('classrooms').select('id,name,code');
    if (rooms.error) throw dbError(rooms.error);
    const names = new Map((rooms.data ?? []).map((r) => [r.id, r]));
    const hol = await this.db.client
      .from('non_instructional_days')
      .select('day,name')
      .gte('day', q.from)
      .lte('day', q.to);
    if (hol.error) throw dbError(hol.error);
    const mnt = await this.db.client
      .from('maintenance_blocks')
      .select('id,classroom_id,starts_at,ends_at,reason')
      .lt('starts_at', `${q.to}T23:59:59+08:00`)
      .gt('ends_at', `${q.from}T00:00:00+08:00`);
    if (mnt.error) throw dbError(mnt.error);
    return {
      from: q.from,
      to: q.to,
      basis: BASIS,
      occurrences: rows.map((r) => ({
        ...r,
        classroom_name: names.get(r.classroom_id)?.name ?? null,
        classroom_code: names.get(r.classroom_id)?.code ?? null,
      })),
      holidays: hol.data ?? [],
      // Visitors see when a room is closed, not why.
      maintenance: (mnt.data ?? [])
        .filter((m) => !q.classroom_id || m.classroom_id === q.classroom_id)
        .map((m) =>
          isAdmin
            ? m
            : {
                id: m.id,
                classroom_id: m.classroom_id,
                starts_at: m.starts_at,
                ends_at: m.ends_at,
              },
        ),
    };
  }

  // --- equipment ---
  async createType(dto: EquipmentTypeDto, actor: AuthUser) {
    const { data, error } = await this.db.client
      .from('equipment_types')
      .insert(dto)
      .select('*')
      .single();
    if (error) throw dbError(error);
    await this.audit.record(actor.id, 'create', 'equipment_type', data.id, { values: dto });
    return data;
  }
  async updateType(id: string, dto: UpdateEquipmentTypeDto, actor: AuthUser) {
    if (!Object.keys(dto).length) throw new BadRequestException('Nothing to update.');
    const { data, error } = await this.db.client
      .from('equipment_types')
      .update(dto)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundException('Equipment type not found.');
    await this.audit.record(actor.id, 'update', 'equipment_type', id, { values: dto });
    return data;
  }
  async deleteType(id: string, actor: AuthUser) {
    const { error } = await this.db.client.from('equipment_types').delete().eq('id', id);
    if (error) throw dbError(error);
    await this.audit.record(actor.id, 'delete', 'equipment_type', id);
    return { deleted: true };
  }
  async putLink(
    table: 'room_equipment' | 'subject_equipment_requirements',
    row: object,
    entity: string,
    actor: AuthUser,
  ) {
    const keys =
      table === 'room_equipment'
        ? 'classroom_id,equipment_type_id'
        : 'subject_id,equipment_type_id';
    const { data, error } = await this.db.client
      .from(table)
      .upsert(row, { onConflict: keys })
      .select('*')
      .single();
    if (error) throw dbError(error);
    await this.audit.record(actor.id, 'upsert', entity, null, { values: row });
    return data;
  }
  async deleteLink(
    table: 'room_equipment' | 'subject_equipment_requirements',
    key: Record<string, string>,
    entity: string,
    actor: AuthUser,
  ) {
    let q: any = this.db.client.from(table).delete();
    for (const [k, v] of Object.entries(key)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw dbError(error);
    await this.audit.record(actor.id, 'delete', entity, null, { key });
    return { deleted: true };
  }
  async list(table: string, orderBy: string) {
    const { data, error } = await this.db.client.from(table).select('*').order(orderBy);
    if (error) throw dbError(error);
    return { data: data ?? [], total: data?.length ?? 0 };
  }
}

@Controller()
export class AdminController {
  constructor(private readonly s: AdminService) {}

  @Roles('admin')
  @Get('admin/dashboard')
  dashboard() {
    return this.s.dashboard();
  }

  @Roles('admin')
  @Get('admin/users')
  users() {
    return this.s.listUsers();
  }

  @Roles('admin')
  @Patch('admin/users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.s.updateUser(id, dto, u);
  }

  @Roles('admin')
  @Post('schedules/check')
  check(@Body() dto: CheckScheduleDto) {
    return this.s.checkSchedule(dto);
  }

  @PublicRead()
  @Get('timetable')
  timetable(@Query() q: TimetableQueryDto, @CurrentUser() u?: AuthUser) {
    return this.s.timetable(q, u?.role === 'admin');
  }

  @PublicRead()
  @PublicRead()
  @Get('campuses')
  campuses() {
    return this.s.list('campuses', 'name');
  }

  @PublicRead()
  @PublicRead()
  @Get('subject-equipment-requirements')
  requirements() {
    return this.s.list('subject_equipment_requirements', 'subject_id');
  }

  @Roles('admin')
  @Post('equipment-types')
  createType(@Body() dto: EquipmentTypeDto, @CurrentUser() u: AuthUser) {
    return this.s.createType(dto, u);
  }
  @Roles('admin')
  @Patch('equipment-types/:id')
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEquipmentTypeDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.s.updateType(id, dto, u);
  }
  @Roles('admin')
  @Delete('equipment-types/:id')
  deleteType(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.s.deleteType(id, u);
  }

  @Roles('admin')
  @Put('room-equipment')
  putRoomEq(@Body() dto: RoomEquipmentDto, @CurrentUser() u: AuthUser) {
    return this.s.putLink('room_equipment', dto, 'room_equipment', u);
  }
  @Roles('admin')
  @Delete('room-equipment')
  delRoomEq(@Body() dto: RoomEquipmentKeyDto, @CurrentUser() u: AuthUser) {
    return this.s.deleteLink('room_equipment', { ...dto }, 'room_equipment', u);
  }
  @Roles('admin')
  @Put('subject-equipment-requirements')
  putReq(@Body() dto: SubjectRequirementDto, @CurrentUser() u: AuthUser) {
    return this.s.putLink(
      'subject_equipment_requirements',
      dto,
      'subject_equipment_requirement',
      u,
    );
  }
  @Roles('admin')
  @Delete('subject-equipment-requirements')
  delReq(@Body() dto: SubjectRequirementKeyDto, @CurrentUser() u: AuthUser) {
    return this.s.deleteLink(
      'subject_equipment_requirements',
      { ...dto },
      'subject_equipment_requirement',
      u,
    );
  }
}
