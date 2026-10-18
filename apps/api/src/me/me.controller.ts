import { Controller, Get } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';

@Controller('me')
export class MeController {
  /** Who am I? The role shown here is the one the server loaded from the database for this request. */
  @Get()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
