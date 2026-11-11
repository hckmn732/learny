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
