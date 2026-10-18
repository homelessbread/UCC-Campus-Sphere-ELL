import { PublicRead } from '../auth/public-read';
import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { SupabaseService } from '../common/supabase.service';

/** Read-only lookup tables. Changing them is a database migration, not an API operation. */
@Injectable()
export class RoomCategoriesService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, { table: 'room_categories', entity: 'room category', orderBy: 'code' });
  }
}
@Injectable()
export class EquipmentTypesService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, { table: 'equipment_types', entity: 'equipment type', orderBy: 'code' });
  }
}
@Injectable()
export class RoomEquipmentService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'room_equipment',
      entity: 'room equipment',
      filters: ['classroom_id', 'equipment_type_id'],
      orderBy: 'classroom_id',
    });
  }
}

@Controller()
export class ReferenceController {
  constructor(
    private readonly categories: RoomCategoriesService,
    private readonly equipment: EquipmentTypesService,
    private readonly roomEquipment: RoomEquipmentService,
  ) {}

  @PublicRead()
  @Get('room-categories')
  listCategories(@Query() q: RawQuery) {
    return this.categories.list(q);
  }

  @PublicRead()
  @Get('equipment-types')
  listEquipmentTypes(@Query() q: RawQuery) {
    return this.equipment.list(q);
  }

  @PublicRead()
  @Get('room-equipment')
  listRoomEquipment(@Query() q: RawQuery) {
    return this.roomEquipment.list(q);
  }
}
