import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AppRole, AuthUser } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Marks a route that needs no sign-in. Everything else requires one. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Restricts a route to the given application roles. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES, roles);
/** Injects the signed-in user placed on the request by AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
