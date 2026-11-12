// Production wiring of the personal-data service (SPEC-211): SPEC-114 Storage signatures for the
// private `exports` bucket, and the short-lived user token presented to Storage on a download.
import { AppError, systemClock } from '@learny/core';
import { SupabaseStorageGateway } from '@learny/db';
import { mintUserAccessToken, type PersonalDataDeps } from '@learny/services';

import { getPublicEnv, getServerEnv } from '../server-env';

let cached: PersonalDataDeps | undefined;

export function personalDataDeps(): PersonalDataDeps {
  if (cached !== undefined) return cached;
  const publicEnv = getPublicEnv();
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const jwtSecret = getServerEnv().SUPABASE_JWT_SECRET;
  if (url === undefined || apiKey === undefined || jwtSecret === undefined) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Le stockage des exports n’est pas configuré.');
  }
  cached = {
    gateway: new SupabaseStorageGateway({ url, apiKey, jwtSecret, clock: systemClock }),
    accessToken: (userId) => mintUserAccessToken(userId, jwtSecret),
  };
  return cached;
}
