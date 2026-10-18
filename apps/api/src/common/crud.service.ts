import { BadRequestException, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from './audit.service';
import { dbError } from './db-error';
import { SupabaseService } from './supabase.service';

export interface CrudOptions {
  table: string;
  entity: string;
  /** Query-string filters allowed on the list route, as column names. Values must be uuids or simple tokens. */
  filters?: string[];
  orderBy?: string;
}

export type RawQuery = Record<string, unknown>;
const TOKEN = /^[A-Za-z0-9_.:+-]{1,64}$/;

/** Shared list/get/create/update/delete logic. Each resource subclasses this with its table name. */
export abstract class CrudService {
  protected constructor(
    protected readonly db: SupabaseService,
    protected readonly audit: AuditService,
    private readonly opts: CrudOptions,
  ) {}

  async list(query: RawQuery = {}) {
    const limit = this.int(query.limit, 'limit', 1, 500) ?? 100;
    const offset = this.int(query.offset, 'offset', 0, 1_000_000) ?? 0;
    let q = this.db.client.from(this.opts.table).select('*', { count: 'exact' });
    for (const col of this.opts.filters ?? []) {
      const v = query[col];
      if (v === undefined) continue;
      if (typeof v !== 'string' || !TOKEN.test(v))
        throw new BadRequestException(`Invalid filter value for ${col}.`);
      if (col.endsWith('_id') && !isUUID(v))
        throw new BadRequestException(`${col} must be a uuid.`);
      q = q.eq(col, v);
    }
    const { data, error, count } = await q
      .order(this.opts.orderBy ?? 'created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw dbError(error);
    return { data: data ?? [], total: count ?? 0, limit, offset };
  }

  async get(id: string) {
    const { data, error } = await this.db.client
      .from(this.opts.table)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundException(`${this.opts.entity} not found.`);
    return data;
  }

  async create(dto: object, actor: AuthUser) {
    const row = { ...dto, ...this.createdBy(actor) };
    const { data, error } = await this.db.client
      .from(this.opts.table)
      .insert(row)
      .select('*')
      .single();
    if (error) throw dbError(error);
    await this.audit.record(actor.id, 'create', this.opts.entity, String(data.id), { values: dto });
    return data;
  }

  async update(id: string, dto: object, actor: AuthUser) {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Nothing to update.');
    const { data, error } = await this.db.client
      .from(this.opts.table)
      .update(dto)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundException(`${this.opts.entity} not found.`);
    await this.audit.record(actor.id, 'update', this.opts.entity, id, { values: dto });
    return data;
  }

  async remove(id: string, actor: AuthUser) {
    const { data, error } = await this.db.client
      .from(this.opts.table)
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundException(`${this.opts.entity} not found.`);
    await this.audit.record(actor.id, 'delete', this.opts.entity, id);
    return { deleted: true, id };
  }

  /** Tables with a created_by column get the acting admin recorded on create. */
  protected createdBy(actor: AuthUser): object {
    void actor;
    return {};
  }

  private int(raw: unknown, name: string, min: number, max: number): number | undefined {
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (typeof raw !== 'string' || !Number.isInteger(n) || n < min || n > max) {
      throw new BadRequestException(`${name} must be an integer between ${min} and ${max}.`);
    }
    return n;
  }
}
