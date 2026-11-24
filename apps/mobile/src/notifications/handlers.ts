// Toucher d'une notification native (SPEC-3501 EF-2 ; BR-NOT-02, BR-NOT-06).
//
// A push carries the same four fields as the Web Push (ADR-3007 §4): the title, the text, the icon
// and an **internal** destination. Tapping it, whatever the state of the application (closed,
// background, foreground), opens that destination **after** the authentication guard: while the
// session is not confirmed the destination is kept and replayed, never opened on a closed shell.
//
// At the foreground the system banner is replaced by the internal one (`push-banner`): the pure
// store below is what the component renders, so a test drives the three states without a device.

/** What a native notification carries; the same document as the service worker of SPEC-205. */
export interface PushContent {
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly tag: string;
}

const MAX_TITLE = 120;
const MAX_BODY = 400;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

/**
 * ET-3, CL-4 — the only destination a tap may open: an internal path (`/...`, never `//host`),
 * bounded, without whitespace or backslash. A malformed or external value opens nothing.
 */
export function destinationOf(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.length > 2048 || /[\s\\]/.test(value)) return null;
  return value;
}

/** The content of a notification, or `null` when the payload is not one of ours (CL-4). */
export function pushContentOf(data: unknown): PushContent | null {
  if (data === null || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const title = text(record.title, MAX_TITLE);
  const body = text(record.body, MAX_BODY);
  const href = destinationOf(record.url);
  if (title === null || body === null || href === null) return null;
  return { title, body, href, tag: typeof record.tag === 'string' ? record.tag : '' };
}

/** What a notification request looks like, both for a system push and for a local notification. */
export interface NotificationRequestLike {
  readonly content: {
    readonly title: string | null;
    readonly body: string | null;
    readonly data?: unknown;
  };
}

/**
 * ET-3, BR-NOT-02 — the payload of a tap: the data document of the Web Push, completed by the
 * title and the text the system displayed (APNs and FCM carry them outside `data`).
 */
export function pushDataOf(request: NotificationRequestLike): Record<string, unknown> {
  const data = request.content.data;
  const record: Record<string, unknown> =
    data !== null && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : {};
  if (typeof record.title !== 'string' && request.content.title !== null) {
    record.title = request.content.title;
  }
  if (typeof record.body !== 'string' && request.content.body !== null) {
    record.body = request.content.body;
  }
  return record;
}

/** The banner of the foreground: one payload at a time, replaced by the next notification. */
export class PushBannerStore {
  private current: PushContent | null = null;
  private readonly listeners = new Set<(content: PushContent | null) => void>();

  get(): PushContent | null {
    return this.current;
  }

  show(content: PushContent): void {
    this.current = content;
    this.emit();
  }

  hide(): void {
    if (this.current === null) return;
    this.current = null;
    this.emit();
  }

  subscribe(listener: (content: PushContent | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.current);
  }
}

/** The banner of the application process (one per process, like the offline wiring). */
export const pushBanner = new PushBannerStore();

/** Outcome of one tap: opened now, kept until the session is confirmed, or not a destination. */
export type PushReception = 'opened' | 'deferred' | 'ignored';

/**
 * Opens the destination of a tap once the session is confirmed.
 *
 * `authenticated` is called by the wiring whenever the session becomes `signedIn`; a destination
 * received while signed out waits there and is opened then, never before (EF-2).
 */
export class PushRouter {
  private pending: string | null = null;
  private signedIn = false;

  constructor(private readonly navigate: (href: string) => void) {}

  receive(data: unknown): PushReception {
    const href = destinationOf(
      data !== null && typeof data === 'object' ? (data as Record<string, unknown>).url : undefined,
    );
    if (href === null) return 'ignored';
    if (!this.signedIn) {
      this.pending = href;
      return 'deferred';
    }
    this.pending = null;
    this.navigate(href);
    return 'opened';
  }

  /** The session is confirmed: the destination kept by a cold start is opened now. */
  setSession(signedIn: boolean): void {
    this.signedIn = signedIn;
    if (signedIn) this.flush();
  }

  /** The destination kept by a cold start is opened now, once the guard has confirmed the session. */
  authenticated(): void {
    this.flush();
  }

  pendingHref(): string | null {
    return this.pending;
  }

  private flush(): void {
    if (this.pending === null || !this.signedIn) return;
    const href = this.pending;
    this.pending = null;
    this.navigate(href);
  }
}

export function createPushRouter(navigate: (href: string) => void): PushRouter {
  return new PushRouter(navigate);
}
