import { BadRequestException, Injectable } from '@nestjs/common';
import { SCHOOL_TIME_ZONE } from '@ucc/shared';
import { fetchAll } from '../common/paging';
import { SupabaseService } from '../common/supabase.service';
import {
  Busy,
  BusyMap,
  buildBusy,
  Candidate,
  Criteria,
  EquipmentNeed,
  MaintenanceRow,
  OccurrenceRow,
  RoomInfo,
  RoomStatus,
  search,
  statusAt,
} from './engine';
import { IntervalQuery, resolveInterval } from './interval';
import { addDays, formatLocal, HOUR, localParts, MINUTE, parseInstant } from './time';

export const LOOKBEHIND = 12 * HOUR;
export const LOOKAHEAD = 24 * HOUR;

export interface FilterQuery {
  building_id?: string;
  floor_id?: string;
  floor_level?: number;
  min_capacity?: number;
  category?: string;
  equipment?: string;
  preferred_building_id?: string;
  preferred_floor_level?: number;
}
export interface SearchQuery extends IntervalQuery, FilterQuery {
  include_unavailable?: string;
  limit?: number;
}
export interface StatusQuery {
  at?: string;
  building_id?: string;
  floor_id?: string;
  floor_level?: number;
}

/** "projector,computers:25" becomes [{code:'projector',quantity:1},{code:'computers',quantity:25}]. */
export function parseEquipment(text: string | undefined): EquipmentNeed[] {
  if (!text) return [];
  return text.split(',').map((part) => {
    const [code, qty] = part.trim().split(':');
    const quantity = qty === undefined ? 1 : Number(qty);
    if (!code || !Number.isInteger(quantity) || quantity < 1)
      throw new BadRequestException(`Invalid equipment filter "${part}".`);
    return { code, quantity };
  });
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const local = (ms: number | null) => (ms === null ? null : formatLocal(ms));

const busyJson = (b: Busy | null) =>
  b && {
    kind: b.kind,
    label: b.label,
    teacher: b.teacher ?? null,
    moved: b.moved ?? false,
    starts_at: iso(b.start),
    ends_at: iso(b.end),
    starts_local: local(b.start),
    ends_local: local(b.end),
  };

const roomJson = (r: RoomInfo) => ({
  classroom_id: r.id,
  name: r.name,
  code: r.code,
  model_object_id: r.modelObjectId,
  building: { id: r.buildingId, code: r.buildingCode, name: r.buildingName },
  floor: { id: r.floorId, level: r.floorLevel },
  capacity: r.capacity,
  category: { code: r.categoryCode, name: r.categoryName },
  equipment: r.equipment,
});

/**
 * THE availability authority. It reads rooms, the expanded class occurrences (database function
 * class_occurrences: weekly rules, date ranges, holidays, cancellations, one-date changes) and maintenance blocks,
 * then hands them to the pure engine. Nothing else in the codebase decides whether a room is free.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly db: SupabaseService) {}

  async status(q: StatusQuery, now = Date.now()) {
    const at = q.at ? this.instant(q.at, 'at') : now;
    const { rooms, busy } = await this.load(at - LOOKBEHIND, at + LOOKAHEAD);
    const criteria: Criteria = {
      buildingId: q.building_id,
      floorId: q.floor_id,
      floorLevel: q.floor_level,
    };
    const statuses: RoomStatus[] = rooms
      .filter((r) => (q.building_id ? r.buildingId === q.building_id : true))
      .filter((r) => (q.floor_id ? r.floorId === q.floor_id : true))
      .filter((r) =>
        criteria.floorLevel !== undefined ? r.floorLevel === criteria.floorLevel : true,
      )
      .map((r) => statusAt(r, busy.get(r.id) ?? [], at))
      .sort(
        (a, b) =>
          a.room.buildingCode.localeCompare(b.room.buildingCode) ||
          a.room.floorLevel - b.room.floorLevel ||
          a.room.name.localeCompare(b.room.name),
      );

    const counts = { free: 0, occupied: 0, maintenance: 0, inactive: 0 };
    for (const s of statuses) counts[s.state]++;
    return {
      at: iso(at),
      at_local: local(at),
      time_zone: SCHOOL_TIME_ZONE,
      basis:
        'Status comes from the class schedule and maintenance records. It is not a measurement of who is physically in the room.',
      counts,
      rooms: statuses.map((s) => ({
        ...roomJson(s.room),
        status: s.state,
        current: busyJson(s.current),
        available_from: iso(s.availableFrom),
        available_from_local: local(s.availableFrom),
        free_until: iso(s.freeUntil),
        free_until_local: local(s.freeUntil),
        next_class: busyJson(s.nextClass),
      })),
    };
  }

  async search(q: SearchQuery, now = Date.now()) {
    const iv = resolveInterval(q, now);
    const criteria: Criteria = {
      buildingId: q.building_id,
      floorId: q.floor_id,
      floorLevel: q.floor_level,
      minCapacity: q.min_capacity,
      category: q.category,
      equipment: parseEquipment(q.equipment),
      preferredBuildingId: q.preferred_building_id,
      preferredFloorLevel: q.preferred_floor_level,
    };
    const { rooms, busy } = await this.load(iv.start - LOOKBEHIND, iv.end + LOOKAHEAD);
    const result = search(rooms, busy, iv, criteria, {
      horizonEnd: iv.end + LOOKAHEAD,
      limit: q.limit ?? 50,
    });

    const candidate = (c: Candidate, rank?: number) => ({
      ...roomJson(c.room),
      ...(rank !== undefined ? { rank } : {}),
      free_from: iso(c.freeFrom),
      free_from_local: local(c.freeFrom),
      free_until: iso(c.freeUntil),
      free_until_local: local(c.freeUntil),
      next_class: busyJson(c.nextClass),
      reasons: c.reasons,
    });
    return {
      interval: {
        start: iso(iv.start),
        end: iso(iv.end),
        start_local: local(iv.start),
        end_local: local(iv.end),
        duration_minutes: Math.round((iv.end - iv.start) / MINUTE),
        time_zone: SCHOOL_TIME_ZONE,
      },
      criteria: { ...criteria, equipment: criteria.equipment },
      basis: 'Based on the class schedule and maintenance records, not on physical occupancy.',
      message: result.message,
      total_qualifying: result.qualifying.length,
      rooms: result.qualifying.map((c, i) => candidate(c, i + 1)),
      alternatives: {
        free_but_miss_a_filter: result.freeButMismatch.map((c) => ({
          ...candidate(c),
          why_not: c.mismatches,
        })),
        free_later: result.laterSlots.map((s) => ({
          ...roomJson(s.room),
          start: iso(s.start),
          end: iso(s.end),
          start_local: local(s.start),
          end_local: local(s.end),
          wait_minutes: s.waitMinutes,
          reasons: s.reasons,
        })),
      },
      ...(q.include_unavailable === 'true'
        ? {
            unavailable: result.unavailable.map((c) => ({
              ...roomJson(c.room),
              why_not: [...c.blockers, ...c.mismatches],
            })),
          }
        : {}),
    };
  }

  private instant(text: string, name: string): number {
    const ms = parseInstant(text);
    if (Number.isNaN(ms))
      throw new BadRequestException(`${name} is not a valid ISO 8601 date and time.`);
    return ms;
  }

  private async load(from: number, to: number): Promise<{ rooms: RoomInfo[]; busy: BusyMap }> {
    const [rooms, occurrences, maintenance] = await Promise.all([
      this.loadRooms(),
      this.loadOccurrences(from, to),
      this.loadMaintenance(from, to),
    ]);
    return { rooms, busy: buildBusy(occurrences, maintenance) };
  }

  private loadOccurrences(from: number, to: number): Promise<OccurrenceRow[]> {
    const dFrom = localParts(from).date;
    const dTo = localParts(to).date;
    return fetchAll<OccurrenceRow>((a, b) =>
      this.db.client
        .rpc('class_occurrences', {
          p_from: dFrom,
          p_to: dTo > addDays(dFrom, 62) ? addDays(dFrom, 62) : dTo,
        })
        .range(a, b),
    );
  }

  private async loadMaintenance(from: number, to: number): Promise<MaintenanceRow[]> {
    return fetchAll<MaintenanceRow>((a, b) =>
      this.db.client
        .from('maintenance_blocks')
        .select('classroom_id, starts_at, ends_at, reason')
        .lt('starts_at', new Date(to).toISOString())
        .gt('ends_at', new Date(from).toISOString())
        .range(a, b),
    );
  }

  private async loadRooms(): Promise<RoomInfo[]> {
    const c = this.db.client;
    const [rooms, floors, buildings, categories, links, types] = await Promise.all([
      fetchAll<Record<string, unknown>>((a, b) =>
        c
          .from('classrooms')
          .select('id, floor_id, category_id, code, name, capacity, status, model_object_id')
          .range(a, b),
      ),
      fetchAll<Record<string, unknown>>((a, b) =>
        c.from('floors').select('id, building_id, level').range(a, b),
      ),
      fetchAll<Record<string, unknown>>((a, b) =>
        c.from('buildings').select('id, code, name').range(a, b),
      ),
      fetchAll<Record<string, unknown>>((a, b) =>
        c.from('room_categories').select('id, code, name').range(a, b),
      ),
      fetchAll<Record<string, unknown>>((a, b) =>
        c.from('room_equipment').select('classroom_id, equipment_type_id, quantity').range(a, b),
      ),
      fetchAll<Record<string, unknown>>((a, b) =>
        c.from('equipment_types').select('id, code, name').range(a, b),
      ),
    ]);
    const by = (rows: Record<string, unknown>[]) => new Map(rows.map((r) => [r.id as string, r]));
    const floorBy = by(floors);
    const buildingBy = by(buildings);
    const categoryBy = by(categories);
    const typeBy = by(types);
    const equipmentBy = new Map<string, RoomInfo['equipment']>();
    for (const l of links) {
      const t = typeBy.get(l.equipment_type_id as string);
      if (!t) continue;
      const list = equipmentBy.get(l.classroom_id as string) ?? [];
      list.push({ code: t.code as string, name: t.name as string, quantity: l.quantity as number });
      equipmentBy.set(l.classroom_id as string, list);
    }
    return rooms.flatMap((r) => {
      const f = floorBy.get(r.floor_id as string);
      const b = f && buildingBy.get(f.building_id as string);
      const k = categoryBy.get(r.category_id as string);
      if (!f || !b || !k) return [];
      return [
        {
          id: r.id as string,
          name: r.name as string,
          code: (r.code as string | null) ?? null,
          capacity: r.capacity as number,
          status: r.status as 'active' | 'inactive',
          modelObjectId: (r.model_object_id as string | null) ?? null,
          categoryCode: k.code as string,
          categoryName: k.name as string,
          floorId: f.id as string,
          floorLevel: f.level as number,
          buildingId: b.id as string,
          buildingCode: b.code as string,
          buildingName: b.name as string,
          equipment: (equipmentBy.get(r.id as string) ?? []).sort((x, y) =>
            x.code.localeCompare(y.code),
          ),
        },
      ];
    });
  }
}
