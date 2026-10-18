/** Global prefix of every API route. */
export const API_PREFIX = 'api';

/** The school's time zone. All schedule logic (Phase 3) is expressed in it. */
export const SCHOOL_TIME_ZONE = 'Asia/Manila';

/** Response of GET /api/health. */
export interface HealthResponse {
  status: 'ok';
  service: 'ucc-campussphere-api';
  version: string;
  /** ISO 8601 timestamp in UTC. */
  time: string;
  schoolTimeZone: typeof SCHOOL_TIME_ZONE;
  supabase: {
    /** True when the server has the Supabase variables it needs. Says nothing about connectivity. */
    configured: boolean;
    /**
     * 'not_tested' unless the request asked for a test (GET /api/health?check=db).
     * 'ok' only when a real query to Supabase succeeded; 'failed' when it did not.
     */
    connection: 'not_tested' | 'ok' | 'failed';
  };
}

/** Application roles. Exactly two exist. */
export type AppRole = 'admin' | 'user';

/** Response of GET /api/me. */
export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
}
