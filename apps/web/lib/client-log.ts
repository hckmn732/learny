// Client-side error logging (SPEC-006, ET-5): only a safe code and the requestId leave the page,
// never the message, the stack or any internal detail (those stay in the server logs).
import { isAppError } from '@learny/core';

export interface SafeErrorInfo {
  code: string;
  requestId?: string;
}

export function safeErrorInfo(error: unknown): SafeErrorInfo {
  if (isAppError(error)) {
    return error.requestId === undefined
      ? { code: error.code }
      : { code: error.code, requestId: error.requestId };
  }
  return { code: 'UNEXPECTED_ERROR' };
}

export function logClientError(error: unknown): SafeErrorInfo {
  const info = safeErrorInfo(error);
  console.warn(JSON.stringify({ msg: 'page error', ...info }));
  return info;
}

/**
 * In the browser, in production, an Error passed to console.error (Next.js logs every error caught
 * by an error boundary) is replaced by its safe summary: no message, no stack (SPEC-006, CL-7).
 */
export function installSafeConsole(target: Pick<Console, 'error'>): void {
  const original = target.error.bind(target);
  target.error = (...args: unknown[]) => {
    original(
      ...args.map((arg) =>
        arg instanceof Error ? JSON.stringify({ msg: 'client error', ...safeErrorInfo(arg) }) : arg,
      ),
    );
  };
}
