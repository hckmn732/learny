// Shapes of the links that open the application (SPEC-3101 EF-6; ADR-3008 § 4).
//
// Kept free of any import so that both the deep-link parser and the component tests can use it
// without pulling the native Auth client (`src/auth/supabase.ts`).

/** Deep link the magic link of the application comes back to (ADR-3008 § 4). */
export const MAGIC_LINK_REDIRECT = 'learny://auth/callback';

/** Types carried by the links of the API contract (`CALLBACK_TYPES` of `packages/contracts`). */
export const CALLBACK_TYPES = ['magiclink', 'signup', 'email'] as const;
export type CallbackType = (typeof CALLBACK_TYPES)[number];

/** True when `value` is a type accepted by the callback route (EF-6). */
export function isCallbackType(value: string): value is CallbackType {
  return (CALLBACK_TYPES as readonly string[]).includes(value);
}
