// Pending authentication kept between the account form and the verification screen (SPEC-601
// ET-4, CL-2). No personal data ever reaches the URL: the address, the method, the intent and the
// send time live in `sessionStorage`, and every access is protected because storage can throw
// (private mode, quota, disabled storage).
export type AuthMethod = 'magic' | 'password';
export type AuthIntent = 'signup' | 'login';
export type PendingNotice = 'confirmation_resent';

export interface PendingAuth {
  email: string;
  method: AuthMethod;
  intent: AuthIntent;
  /** ISO instant of the last sending, used by the resend countdown. */
  sentAt: string;
  /** Optional status shown after landing on the verification screen. */
  notice?: PendingNotice;
}

export interface AuthDraft {
  email: string;
  method: AuthMethod;
}

const PENDING_KEY = 'learny.pendingAuth';
const DRAFT_KEY = 'learny.authDraft';
const PENDING_EVENT = 'learny:pending-auth';
const MAX_EMAIL_LENGTH = 254;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isMethod(value: unknown): value is AuthMethod {
  return value === 'magic' || value === 'password';
}

function isIntent(value: unknown): value is AuthIntent {
  return value === 'signup' || value === 'login';
}

function readObject(key: string): Record<string, unknown> | null {
  const store = storage();
  if (store === null) return null;
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function writeObject(key: string, value: unknown): void {
  const store = storage();
  if (store === null) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the countdown falls back to the server's 429 (CL-2).
  }
}

function notifyPendingChange(): void {
  try {
    window.dispatchEvent(new Event(PENDING_EVENT));
  } catch {
    // No window (server render): nothing to notify.
  }
}

export function savePendingAuth(pending: PendingAuth): void {
  writeObject(PENDING_KEY, pending);
  notifyPendingChange();
}

export function readPendingAuth(): PendingAuth | null {
  const value = readObject(PENDING_KEY);
  if (value === null) return null;
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const sentAt = typeof value.sentAt === 'string' ? value.sentAt : '';
  if (
    email === '' ||
    email.length > MAX_EMAIL_LENGTH ||
    !isMethod(value.method) ||
    !isIntent(value.intent) ||
    sentAt === '' ||
    Number.isNaN(Date.parse(sentAt))
  ) {
    return null;
  }
  const notice = value.notice === 'confirmation_resent' ? 'confirmation_resent' : undefined;
  return {
    email,
    method: value.method,
    intent: value.intent,
    sentAt,
    ...(notice === undefined ? {} : { notice }),
  };
}

export function clearPendingAuth(): void {
  const store = storage();
  if (store === null) return;
  try {
    store.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
  notifyPendingChange();
}

export function saveAuthDraft(draft: AuthDraft): void {
  writeObject(DRAFT_KEY, { email: draft.email.trim(), method: draft.method });
}

export function readAuthDraft(): AuthDraft | null {
  const value = readObject(DRAFT_KEY);
  if (value === null) return null;
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  if (email.length > MAX_EMAIL_LENGTH || !isMethod(value.method)) return null;
  return { email, method: value.method };
}

// ---------------------------------------------------------------------------------------------
// Stable snapshot for `useSyncExternalStore` (SPEC-601 ET-4): reading `sessionStorage` during the
// first client render would break hydration, so the verification card subscribes instead.

let lastRaw: string | null | undefined;
let lastValue: PendingAuth | null = null;

/** Current pending authentication, cached by the raw storage value. */
export function pendingAuthSnapshot(): PendingAuth | null {
  const store = storage();
  let raw: string | null = null;
  try {
    raw = store?.getItem(PENDING_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastValue = readPendingAuth();
  }
  return lastValue;
}

/** Subscribes to same-tab writes and to other tabs of the same origin. */
export function subscribePendingAuth(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === PENDING_KEY) onChange();
  };
  window.addEventListener(PENDING_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PENDING_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
