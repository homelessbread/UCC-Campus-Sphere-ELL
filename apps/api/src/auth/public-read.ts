import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { AuthUser } from './auth.types';
import { Public } from './decorators';

/** Fields that identify who did something or how to reach a person. Only administrators ever receive them. */
const PRIVATE_KEYS = new Set(['created_by', 'updated_by', 'user_id', 'email', 'employee_no']);

export function stripPrivate(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrivate);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!PRIVATE_KEYS.has(k)) out[k] = stripPrivate(v);
    return out;
  }
  return value;
}

/** On public read routes, anyone who is not a signed-in administrator gets the response without private fields. */
@Injectable()
export class PublicReadInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    return next.handle().pipe(map((body) => (user?.role === 'admin' ? body : stripPrivate(body))));
  }
}

/** Marks a read-only route that anyone may call without signing in. Writes never use this. */
export const PublicRead = () => applyDecorators(Public(), UseInterceptors(PublicReadInterceptor));
