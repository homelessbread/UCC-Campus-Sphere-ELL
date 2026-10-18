import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { dbError } from '../common/db-error';
import { SupabaseService } from '../common/supabase.service';
import { AppRole, AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly db: SupabaseService) {}

  /**
   * Verifies a Supabase access token with Supabase Auth, then loads the user's status and role from the
   * database. The role is NEVER read from the token or from user metadata, so a client cannot choose it.
   */
  async authenticate(token: string): Promise<AuthUser> {
    const client = this.db.client;
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user)
      throw new UnauthorizedException('Your session is invalid or has expired.');

    const id = data.user.id;
    const [profile, role] = await Promise.all([
      client.from('profiles').select('email, full_name, status').eq('id', id).maybeSingle(),
      client.from('user_roles').select('role').eq('user_id', id).maybeSingle(),
    ]);
    if (profile.error) throw dbError(profile.error);
    if (role.error) throw dbError(role.error);
    if (!profile.data || !role.data)
      throw new ForbiddenException('This account has no profile yet.');
    if (profile.data.status !== 'active')
      throw new ForbiddenException('This account is suspended.');

    return {
      id,
      email: profile.data.email as string,
      fullName: (profile.data.full_name as string | null) ?? null,
      role: role.data.role as AppRole,
    };
  }
}
