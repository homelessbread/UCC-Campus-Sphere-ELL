import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AppRole, AuthUser } from './auth.types';
import { IS_PUBLIC, ROLES } from './decorators';

/** Runs first on every route. Public routes pass; all others need a valid Bearer token. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (isPublic) {
      // Public routes never require a token. If an admin happens to send a valid one, it is recognised so
      // they still see the private fields. A missing or bad token is simply treated as an anonymous visitor.
      if (scheme?.toLowerCase() === 'bearer' && token) {
        try {
          req.user = await this.auth.authenticate(token);
        } catch {
          /* anonymous */
        }
      }
      return true;
    }
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Sign in required.');
    }
    req.user = await this.auth.authenticate(token);
    return true;
  }
}

/** Runs second. Enforces @Roles(...) on the handler or controller. Routes without @Roles allow any signed-in user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to do this.');
    }
    return true;
  }
}
