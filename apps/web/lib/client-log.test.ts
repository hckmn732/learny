import { describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';

import { installSafeConsole, logClientError, safeErrorInfo } from './client-log';

describe('[SPEC-006] client error log', () => {
  it('keeps only a safe code and the requestId', () => {
    expect(safeErrorInfo(new AppError('MODULE_LOCKED', 'détail', { requestId: 'req-1' }))).toEqual({
      code: 'MODULE_LOCKED',
      requestId: 'req-1',
    });
    expect(safeErrorInfo(new TypeError('x is undefined at secret.ts:12'))).toEqual({
      code: 'UNEXPECTED_ERROR',
    });
    expect(safeErrorInfo('boom')).toEqual({ code: 'UNEXPECTED_ERROR' });
  });

  it('logs neither the message nor the stack of an error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logClientError(new Error('internal detail'));
    expect(warn).toHaveBeenCalledWith('{"msg":"page error","code":"UNEXPECTED_ERROR"}');
    warn.mockRestore();
  });

  it('redacts Error arguments of console.error once installed', () => {
    const calls: unknown[][] = [];
    const target = {
      error: (...args: unknown[]) => {
        calls.push(args);
      },
    };
    installSafeConsole(target);
    const error = new AppError('INTERNAL_ERROR', 'Erreur interne détaillée', { requestId: 'r-9' });
    target.error('context', error);
    expect(calls).toEqual([
      ['context', '{"msg":"client error","code":"INTERNAL_ERROR","requestId":"r-9"}'],
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/détaillée|\bat\b/);
  });
});
