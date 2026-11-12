// Unit tests of the upload limits (SPEC-206 §12, CA-1): exact bounds of BR-APP-02 applied to real
// bytes, real signatures and real PDF page counts, and the business codes they produce. No network
// and no database: the file service ports are exercised with fakes where needed.
import { createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { RESOURCE_LIMITS } from '@learny/config';
import { AppError, toProblem } from '@learny/core';

import { buildImage, buildPdf } from '../../test/support/files';
import type { ServiceContext } from '../context';
import { simulateUpload } from '../dev/uploads';

import { uploadedEventId } from './deps';
import { detectUpload } from './detect';
import {
  assertCapacity,
  assertDeclaredUpload,
  assertFileSize,
  assertNoteText,
  assertPdfPages,
  countCharacters,
  evaluateUpload,
  kindForDeclaredMime,
} from './limits';
import { translateLimitError } from './queries';
import { SupabaseObjectReader, fingerprint, mintUserAccessToken } from './storage';

const MEGABYTE = 1024 * 1024;

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return 'OK';
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return 'OK';
}

describe('[SPEC-206] upload limits', () => {
  describe('PDF', () => {
    it('accepts 50 MB and 500 pages exactly, refuses one byte or one page beyond (CL-1)', async () => {
      expect(RESOURCE_LIMITS.pdfMaxBytes).toBe(50 * MEGABYTE);
      expect(
        code(() => {
          assertFileSize('pdf', RESOURCE_LIMITS.pdfMaxBytes);
        }),
      ).toBe('OK');
      expect(
        code(() => {
          assertFileSize('pdf', RESOURCE_LIMITS.pdfMaxBytes + 1);
        }),
      ).toBe('UPLOAD_TOO_LARGE');
      expect(
        code(() => {
          assertPdfPages(500);
        }),
      ).toBe('OK');
      expect(
        code(() => {
          assertPdfPages(501);
        }),
      ).toBe('UPLOAD_TOO_LARGE');

      // Real bytes: a valid 50 MB PDF of 500 pages, then the same document with a 501st page.
      const exact = buildPdf({ pages: 500, totalBytes: RESOURCE_LIMITS.pdfMaxBytes });
      expect(exact.length).toBe(RESOURCE_LIMITS.pdfMaxBytes);
      await expect(detectUpload(exact, 'pdf')).resolves.toEqual({
        mime: 'application/pdf',
        pages: 500,
      });
      await expect(codeOf(() => detectUpload(buildPdf({ pages: 501 }), 'pdf'))).resolves.toBe(
        'UPLOAD_TOO_LARGE',
      );
    });

    it('counts the pages of small documents', async () => {
      await expect(detectUpload(buildPdf({ pages: 1 }), 'pdf')).resolves.toEqual({
        mime: 'application/pdf',
        pages: 1,
      });
      await expect(detectUpload(buildPdf({ pages: 37 }), 'pdf')).resolves.toMatchObject({
        pages: 37,
      });
    });

    it('refuses damaged and hostile data as an unsupported type (ET-2)', async () => {
      const encoder = new TextEncoder();
      const damaged = [
        encoder.encode('%PDF-1.4 ceci n’est pas un document'),
        encoder.encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
        buildPdf({ pages: 3 }).slice(0, 120),
      ];
      for (const bytes of damaged) {
        await expect(codeOf(() => detectUpload(bytes, 'pdf'))).resolves.toBe('UNSUPPORTED_TYPE');
      }
    });
  });

  describe('image', () => {
    it('accepts 10 MB exactly, refuses one byte beyond (CL-2)', async () => {
      expect(RESOURCE_LIMITS.imageMaxBytes).toBe(10 * MEGABYTE);
      expect(
        code(() => {
          assertFileSize('image', RESOURCE_LIMITS.imageMaxBytes);
        }),
      ).toBe('OK');
      expect(
        code(() => {
          assertFileSize('image', RESOURCE_LIMITS.imageMaxBytes + 1);
        }),
      ).toBe('UPLOAD_TOO_LARGE');
      const exact = buildImage('png', RESOURCE_LIMITS.imageMaxBytes);
      await expect(detectUpload(exact, 'image')).resolves.toEqual({
        mime: 'image/png',
        pages: null,
      });
    });

    it.each([
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['webp', 'image/webp'],
      ['heic', 'image/heic'],
    ] as const)('detects a real %s from its signature', async (format, mime) => {
      await expect(detectUpload(buildImage(format), 'image')).resolves.toEqual({
        mime,
        pages: null,
      });
    });

    it('refuses an executable renamed .png, whatever the name announces (CL-2)', async () => {
      const executable = buildImage('exe', 4096);
      await expect(codeOf(() => detectUpload(executable, 'image'))).resolves.toBe(
        'UNSUPPORTED_TYPE',
      );
      // The declared type and the file name are only hints: the same bytes are refused for a PDF.
      await expect(codeOf(() => detectUpload(executable, 'pdf'))).resolves.toBe('UNSUPPORTED_TYPE');
    });

    it('refuses an image format outside BR-APP-02 and a text file', async () => {
      await expect(codeOf(() => detectUpload(buildImage('gif'), 'image'))).resolves.toBe(
        'UNSUPPORTED_TYPE',
      );
      const text = new TextEncoder().encode('# Titre\n\nUne note déguisée en image.\n');
      await expect(codeOf(() => detectUpload(text, 'image'))).resolves.toBe('UNSUPPORTED_TYPE');
      await expect(codeOf(() => detectUpload(new Uint8Array(0), 'image'))).resolves.toBe(
        'UNSUPPORTED_TYPE',
      );
    });

    it('refuses a content that does not match the kind the resource was created for', async () => {
      await expect(codeOf(() => detectUpload(buildPdf({ pages: 2 }), 'image'))).resolves.toBe(
        'UNSUPPORTED_TYPE',
      );
      await expect(codeOf(() => detectUpload(buildImage('png'), 'pdf'))).resolves.toBe(
        'UNSUPPORTED_TYPE',
      );
    });
  });

  describe('note', () => {
    it('accepts 100 000 characters exactly, refuses one beyond', () => {
      expect(RESOURCE_LIMITS.noteMaxChars).toBe(100_000);
      expect(
        code(() => {
          assertNoteText('a'.repeat(100_000));
        }),
      ).toBe('OK');
      expect(
        code(() => {
          assertNoteText('a'.repeat(100_001));
        }),
      ).toBe('UPLOAD_TOO_LARGE');
    });

    it('counts characters like the database, not UTF-16 units', () => {
      expect(countCharacters('é')).toBe(1);
      expect(countCharacters('🙂🙂')).toBe(2);
      expect(
        code(() => {
          assertNoteText('🙂'.repeat(100_000));
        }),
      ).toBe('OK');
      expect(
        code(() => {
          assertNoteText('🙂'.repeat(100_001));
        }),
      ).toBe('UPLOAD_TOO_LARGE');
    });
  });

  describe('declared type (EF-1, ET-7)', () => {
    it('maps declared media types to a kind, ignoring case and parameters', () => {
      expect(kindForDeclaredMime('application/pdf')).toBe('pdf');
      expect(kindForDeclaredMime('Image/PNG; foo=bar')).toBe('image');
      expect(kindForDeclaredMime('image/heic')).toBe('image');
      expect(kindForDeclaredMime('image/jpeg')).toBe('image');
      expect(kindForDeclaredMime('image/webp')).toBe('image');
    });

    it('refuses audio, video and everything else with UNSUPPORTED_TYPE', () => {
      for (const mime of [
        'audio/mpeg',
        'video/mp4',
        'application/zip',
        'text/plain',
        'image/gif',
        '',
      ]) {
        expect(
          code(() => kindForDeclaredMime(mime)),
          mime,
        ).toBe('UNSUPPORTED_TYPE');
      }
    });

    it('checks the type before the size', () => {
      expect(code(() => assertDeclaredUpload({ mime: 'video/mp4', sizeBytes: 10 ** 12 }))).toBe(
        'UNSUPPORTED_TYPE',
      );
      expect(
        code(() => assertDeclaredUpload({ mime: 'image/png', sizeBytes: 11 * MEGABYTE })),
      ).toBe('UPLOAD_TOO_LARGE');
    });
  });

  describe('capacity (EF-6, CL-3)', () => {
    it('refuses the 101st contribution of a chapter, accepts the 100th', () => {
      expect(
        code(() => {
          assertCapacity({ chapterCount: 99, usedBytes: 0, addedBytes: 0 });
        }),
      ).toBe('OK');
      expect(
        code(() => {
          assertCapacity({ chapterCount: 100, usedBytes: 0, addedBytes: 0 });
        }),
      ).toBe('QUOTA_EXCEEDED');
    });

    it('refuses what would exceed 2 GB, accepts the exact remainder', () => {
      const quota = RESOURCE_LIMITS.userQuotaBytes;
      expect(quota).toBe(2 * 1024 * MEGABYTE);
      expect(
        code(() => {
          assertCapacity({ chapterCount: 0, usedBytes: quota - 5, addedBytes: 5 });
        }),
      ).toBe('OK');
      expect(
        code(() => {
          assertCapacity({ chapterCount: 0, usedBytes: quota - 5, addedBytes: 6 });
        }),
      ).toBe('QUOTA_EXCEEDED');
    });

    it('applies the checks in order: type, size, pages, capacity', () => {
      const base = { chapterCount: 100, usedBytes: 0, addedBytes: 1 };
      expect(code(() => evaluateUpload({ mime: 'text/plain', sizeBytes: 1, ...base }))).toBe(
        'UNSUPPORTED_TYPE',
      );
      expect(
        code(() => evaluateUpload({ mime: 'application/pdf', sizeBytes: 60 * MEGABYTE, ...base })),
      ).toBe('UPLOAD_TOO_LARGE');
      expect(
        code(() => evaluateUpload({ mime: 'application/pdf', sizeBytes: 1, pages: 501, ...base })),
      ).toBe('UPLOAD_TOO_LARGE');
      expect(
        code(() => evaluateUpload({ mime: 'application/pdf', sizeBytes: 1, pages: 3, ...base })),
      ).toBe('QUOTA_EXCEEDED');
    });
  });

  describe('problem+json codes (EF-6)', () => {
    it('answers business codes with a 422 and an explicit message', () => {
      const cases: Array<[() => unknown, string]> = [
        [
          () => {
            assertFileSize('pdf', RESOURCE_LIMITS.pdfMaxBytes + 1);
          },
          'UPLOAD_TOO_LARGE',
        ],
        [() => kindForDeclaredMime('application/x-msdownload'), 'UNSUPPORTED_TYPE'],
        [
          () => {
            assertCapacity({ chapterCount: 100, usedBytes: 0, addedBytes: 0 });
          },
          'QUOTA_EXCEEDED',
        ],
      ];
      for (const [fn, expected] of cases) {
        try {
          fn();
          throw new Error('une erreur était attendue');
        } catch (error) {
          const problem = toProblem(error, 'req-12345678');
          expect(problem.code).toBe(expected);
          expect(problem.status).toBe(422);
          expect(problem.detail.length).toBeGreaterThan(20);
        }
      }
    });

    it('translates the database limit triggers into the same codes (defence in depth)', () => {
      const trigger = (message: string) =>
        translateLimitError(new Error('Failed query', { cause: new Error(message) }));
      expect((trigger('chapter_resource_limit') as AppError).code).toBe('QUOTA_EXCEEDED');
      expect((trigger('storage_quota_exceeded') as AppError).code).toBe('QUOTA_EXCEEDED');
      expect((trigger('resource_pdf_limit') as AppError).code).toBe('UPLOAD_TOO_LARGE');
      expect((trigger('resource_image_limit') as AppError).code).toBe('UPLOAD_TOO_LARGE');
      expect(
        (
          translateLimitError(
            new Error('violates check constraint "resources_pdf_pages"'),
          ) as AppError
        ).code,
      ).toBe('UPLOAD_TOO_LARGE');
      const unrelated = new Error('connexion perdue');
      expect(translateLimitError(unrelated)).toBe(unrelated);
    });
  });

  describe('simulation of the SDD page (EF-7)', () => {
    const ctx = {} as ServiceContext;

    it('accepts the limit cases and refuses the others with the service codes', async () => {
      const outcomes: Record<string, string> = {};
      for (const name of [
        'pdf-limit',
        'pdf-too-many-pages',
        'image-limit',
        'image-too-large',
        'executable-as-png',
        'note-too-long',
        'chapter-full',
        'quota-reached',
      ] as const) {
        const result = await simulateUpload(ctx, { case: name });
        outcomes[name] = result.ok ? 'accepted' : result.error.code;
      }
      expect(outcomes).toEqual({
        'pdf-limit': 'accepted',
        'pdf-too-many-pages': 'UPLOAD_TOO_LARGE',
        'image-limit': 'accepted',
        'image-too-large': 'UPLOAD_TOO_LARGE',
        'executable-as-png': 'UNSUPPORTED_TYPE',
        'note-too-long': 'UPLOAD_TOO_LARGE',
        'chapter-full': 'QUOTA_EXCEEDED',
        'quota-reached': 'QUOTA_EXCEEDED',
      });
    });
  });

  describe('storage access (ET-4)', () => {
    it('mints a short-lived authenticated token for one user, signed with the server secret', () => {
      const secret = randomBytes(24).toString('hex');
      const userId = '11111111-1111-4111-8111-111111111111';
      const clock = { now: () => new Date('2026-11-11T12:20:00Z') };
      const token = mintUserAccessToken(userId, secret, clock);
      const [header, payload, signature] = token.split('.');
      expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString())).toEqual({
        alg: 'HS256',
        typ: 'JWT',
      });
      const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as {
        sub: string;
        role: string;
        iat: number;
        exp: number;
      };
      expect(claims).toMatchObject({ sub: userId, role: 'authenticated' });
      expect(claims.exp - claims.iat).toBe(60);
      expect(signature).toBe(
        createHmac('sha256', secret)
          .update(`${header ?? ''}.${payload ?? ''}`)
          .digest('base64url'),
      );
      expect(code(() => mintUserAccessToken(userId, '', clock))).toBe('SERVICE_UNAVAILABLE');
    });

    it('reads an object through Storage, stops an oversized body and reports a missing one', async () => {
      const calls: string[] = [];
      const accessToken = randomBytes(12).toString('hex');
      const reader = new SupabaseObjectReader({
        url: 'http://storage.test/',
        apiKey: randomBytes(12).toString('hex'),
        fetchImplementation: (input, init) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
          calls.push(url);
          const headers = init?.headers as Record<string, string> | undefined;
          expect(headers?.authorization).toBe(`Bearer ${accessToken}`);
          if (url.includes('/missing/')) {
            return Promise.resolve(
              new Response(JSON.stringify({ statusCode: '404', error: 'not_found' }), {
                status: 400,
              }),
            );
          }
          if (url.includes('/object/info/')) {
            return Promise.resolve(
              Response.json({ size: 5, etag: '"abc"', name: 'ne-doit-pas-etre-lu' }),
            );
          }
          return Promise.resolve(
            new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { etag: '"abc"' } }),
          );
        },
      });
      await expect(reader.info('resources', 'u/r/guide final.pdf', accessToken)).resolves.toEqual({
        size: 5,
        etag: '"abc"',
      });
      expect(calls[0]).toBe(
        'http://storage.test/storage/v1/object/info/authenticated/resources/u/r/guide%20final.pdf',
      );
      const content = await reader.read('resources', 'u/r/guide.pdf', accessToken, 5);
      expect(Array.from(content?.bytes ?? [])).toEqual([1, 2, 3, 4, 5]);
      expect(content?.etag).toBe('"abc"');
      await expect(
        codeOf(() => reader.read('resources', 'u/r/guide.pdf', accessToken, 4)),
      ).resolves.toBe('UPLOAD_TOO_LARGE');
      await expect(reader.info('resources', 'u/missing/x.pdf', accessToken)).resolves.toBeNull();
      await expect(reader.read('resources', 'u/missing/x.pdf', accessToken, 5)).resolves.toBeNull();
    });

    it('fingerprints bytes with SHA-256 and gives a stable event id per resource (ET-5, CL-4)', () => {
      expect(fingerprint(new TextEncoder().encode('abc'))).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
      expect(uploadedEventId('33333333-3333-4333-8333-333333333333')).toBe(
        'resource-uploaded:33333333-3333-4333-8333-333333333333',
      );
    });
  });
});
