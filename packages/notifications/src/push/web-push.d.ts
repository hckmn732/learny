// Minimal typing of the `web-push` 4 ESM entry (ADR-0055): only the surface the live transport
// uses. The package ships no declarations and `@types/web-push` describes the CommonJS 3.x API.
declare module 'web-push' {
  export interface WebPushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  export interface WebPushVapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }
  export interface WebPushRequestOptions {
    vapidDetails?: WebPushVapidDetails;
    TTL?: number;
    topic?: string;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    timeout?: number;
    headers?: Record<string, string>;
    contentEncoding?: 'aes128gcm' | 'aesgcm';
  }
  export interface WebPushResult {
    statusCode: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
  }
  export class WebPushError extends Error {
    statusCode: number;
    body: string;
    endpoint: string;
  }
  export function sendNotification(
    subscription: WebPushSubscription,
    payload?: string | Buffer | null,
    options?: WebPushRequestOptions,
  ): Promise<WebPushResult>;
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
}
