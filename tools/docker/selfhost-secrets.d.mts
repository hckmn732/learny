export function toolNow(env?: Record<string, string | undefined>): Date;
export function createJwt(secret: string, payload: Record<string, unknown>): string;
export function serviceKeys(
  jwtSecret: string,
  issuedAtSeconds: number,
): { anon: string; service: string };
export function generateSecrets(now: Date): {
  POSTGRES_PASSWORD: string;
  SUPABASE_JWT_SECRET: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  APP_ENCRYPTION_KEY: string;
};
