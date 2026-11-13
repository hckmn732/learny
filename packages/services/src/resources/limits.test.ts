// Unit tests of the coded limits of BR-APP-02 (SPEC-607 CA-1, EF-2).
//
// The five numeric bounds are exercised at their exact edge: the accepted value and the first
// refused value. The same functions and the same `RESOURCE_LIMITS` feed the upload service and the
// screen counters, so a change of one constant cannot silently drift from the other.
import { describe, expect, it } from 'vitest';

import { RESOURCE_LIMITS } from '@learny/config';
import {
  RESOURCE_KINDS_V1,
  RESOURCE_KINDS_V2,
  V1_RESOURCE_OFFERS,
} from '@learny/contracts';
import { AppError } from '@learny/core';

import {
  assertCapacity,
  assertFileSize,
  assertNoteText,
  assertPdfPages,
} from './limits';

const MEBIBYTE = 1024 * 1024;

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return 'OK';
}

describe('[SPEC-607] limites des apports', () => {
  it('CA-1 — PDF : 50 Mo et 500 pages acceptés, un octet ou une page au-delà refusés', () => {
    expect(RESOURCE_LIMITS.pdfMaxBytes).toBe(50 * MEBIBYTE);
    expect(code(() => { assertFileSize('pdf', 50 * MEBIBYTE); })).toBe('OK');
    expect(code(() => { assertFileSize('pdf', 50 * MEBIBYTE + 1); })).toBe('UPLOAD_TOO_LARGE');
    expect(code(() => { assertPdfPages(500); })).toBe('OK');
    expect(code(() => { assertPdfPages(501); })).toBe('UPLOAD_TOO_LARGE');
  });

  it('CA-1 — image : 10 Mo acceptés, un octet au-delà refusé', () => {
    expect(RESOURCE_LIMITS.imageMaxBytes).toBe(10 * MEBIBYTE);
    expect(code(() => { assertFileSize('image', 10 * MEBIBYTE); })).toBe('OK');
    expect(code(() => { assertFileSize('image', 10 * MEBIBYTE + 1); })).toBe('UPLOAD_TOO_LARGE');
  });

  it('CA-1 — note : 100 000 caractères acceptés, un caractère au-delà refusé', () => {
    expect(RESOURCE_LIMITS.noteMaxChars).toBe(100_000);
    expect(code(() => { assertNoteText('a'.repeat(100_000)); })).toBe('OK');
    expect(code(() => { assertNoteText('a'.repeat(100_001)); })).toBe('UPLOAD_TOO_LARGE');
  });

  it('CA-1 — 100 apports par chapitre, le 101e refusé avec un message explicite', () => {
    expect(RESOURCE_LIMITS.perChapter).toBe(100);
    expect(
      code(() => { assertCapacity({ chapterCount: 99, usedBytes: 0, addedBytes: 0 }); },
      ),
    ).toBe('OK');
    expect(
      code(() => { assertCapacity({ chapterCount: 100, usedBytes: 0, addedBytes: 0 }); },
      ),
    ).toBe('QUOTA_EXCEEDED');
  });

  it('CA-1 — quota de 2 Go par utilisateur, le premier octet au-delà refusé', () => {
    expect(RESOURCE_LIMITS.userQuotaBytes).toBe(2 * 1024 * MEBIBYTE);
    expect(
      code(() => { assertCapacity({
          chapterCount: 0,
          usedBytes: RESOURCE_LIMITS.userQuotaBytes - 1,
          addedBytes: 1,
        }); },
      ),
    ).toBe('OK');
    expect(
      code(() => { assertCapacity({
          chapterCount: 0,
          usedBytes: RESOURCE_LIMITS.userQuotaBytes,
          addedBytes: 1,
        }); },
      ),
    ).toBe('QUOTA_EXCEEDED');
  });

  it('CA-1 — les six types V1 sont offerts, les deux types fichier V2 sont absents', () => {
    expect(V1_RESOURCE_OFFERS).toHaveLength(6);
    expect(new Set(V1_RESOURCE_OFFERS)).toEqual(
      new Set(['note', 'pdf', 'web', 'youtube', 'image', 'exam_guide']),
    );
    expect(RESOURCE_KINDS_V1).toHaveLength(6);
    expect(RESOURCE_KINDS_V2).toEqual(['audio', 'video']);
    expect(V1_RESOURCE_OFFERS).not.toContain('audio');
    expect(V1_RESOURCE_OFFERS).not.toContain('video');
  });
});
