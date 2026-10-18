import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly db: SupabaseService) {}

  /** Records an administrative change. A failure is logged loudly but does not undo the change that already happened. */
  async record(
    actorId: string,
    action: string,
    entity: string,
    entityId: string | null,
    details: object = {},
  ) {
    const { error } = await this.db.client
      .from('audit_logs')
      .insert({ actor_id: actorId, action, entity, entity_id: entityId, details });
    if (error)
      this.logger.error(`Could not write audit log for ${action} ${entity}: ${error.message}`);
  }
}
