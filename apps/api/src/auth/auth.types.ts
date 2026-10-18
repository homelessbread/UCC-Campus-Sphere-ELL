export type AppRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
}
