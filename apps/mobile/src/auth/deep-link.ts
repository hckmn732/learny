// Parsing of the links that open the application (SPEC-3101 EF-6, CL-3; ADR-3008 § 4).
//
// Three shapes reach the callback route:
// - `learny://auth/callback?code=…` and `https://<web>/auth/mobile?code=…` (PKCE code);
// - `https://<web>/api/v1/auth/callback?token_hash=…&type=magiclink` — the shape of the e-mails
//   of the project (`supabase/templates`), intercepted by the application when it is installed;
// - anything else, answered by the « Ce lien n'est plus valide » screen.
// Pure module: the route only forwards `useLocalSearchParams()` and reads the result.
import { CALLBACK_TYPES, type CallbackType } from './email-auth';

export type AuthLink =
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'token'; readonly tokenHash: string; readonly type: CallbackType }
  | { readonly kind: 'invalid' };

/** Query value that may arrive as a single string or as an array (Expo Router). */
export type LinkParams = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.trim() !== '');
    return first === undefined ? null : first.trim();
  }
  return null;
}

function isCallbackType(value: string): value is CallbackType {
  return (CALLBACK_TYPES as readonly string[]).includes(value);
}

/** Reads the parameters of the callback route (EF-6). */
export function parseAuthLink(params: LinkParams): AuthLink {
  const code = single(params.code);
  if (code !== null) return { kind: 'code', code };

  const tokenHash = single(params.token_hash);
  if (tokenHash !== null) {
    const type = single(params.type);
    if (type !== null && isCallbackType(type)) return { kind: 'token', tokenHash, type };
  }

  return { kind: 'invalid' };
}
