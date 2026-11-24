import { z } from 'zod';

import { defineRoute } from './define-route';

// Public configuration of the clients (ADR-4007): the mobile application only needs the API URL at
// build time and reads the rest here. Every value is public; a value that is not configured on the
// server is `null`.
export const PublicConfig = z.object({
  supabaseUrl: z.string().min(1).nullable(),
  supabaseAnonKey: z.string().min(1).nullable(),
  webUrl: z.string().min(1).nullable(),
  vapidPublicKey: z.string().min(1).nullable(),
  stripePublishableKey: z.string().min(1).nullable(),
});
export type PublicConfig = z.infer<typeof PublicConfig>;

export const configPublic = defineRoute({
  id: 'config.public',
  method: 'GET',
  path: '/api/v1/config/public',
  auth: 'public',
  output: PublicConfig,
  successStatus: 200,
  summary: 'Configuration publique des clients : Supabase, web, VAPID et Stripe (ADR-4007).',
  errors: ['INTERNAL_ERROR'],
});

export const publicConfigRoutes = { configPublic } as const;
