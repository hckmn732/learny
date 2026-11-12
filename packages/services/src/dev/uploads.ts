// Demonstration of the upload limits (SPEC-206 EF-7): the simulated sizes go through the very
// checks of the real flow (`evaluateUpload`, `assertNoteText`, `detectUpload`), without creating a
// file, a row or a blob. A refusal throws the same `AppError` the real service answers.
import { RESOURCE_LIMITS } from '@learny/config';
import type { SimulateUploadBody, SimulateUploadOutput } from '@learny/contracts';
import { AppError, err, ok, type Result } from '@learny/core';

import type { ServiceContext } from '../context';
import { detectUpload } from '../resources/detect';
import { assertNoteText, evaluateUpload } from '../resources/limits';

const MEGABYTE = 1024 * 1024;
// `MZ` header of a Windows executable: the hostile content behind a `.png` name (CL-2).
const EXECUTABLE_BYTES = new Uint8Array([
  0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00,
]);
const FRESH = { chapterCount: 0, usedBytes: 0 } as const;

type Outcome = Omit<SimulateUploadOutput, 'case' | 'accepted'>;

async function simulate(input: SimulateUploadBody['case']): Promise<Outcome> {
  switch (input) {
    case 'pdf-limit': {
      const sizeBytes = RESOURCE_LIMITS.pdfMaxBytes;
      const pages = RESOURCE_LIMITS.pdfMaxPages;
      const kind = evaluateUpload({
        mime: 'application/pdf',
        sizeBytes,
        pages,
        addedBytes: sizeBytes,
        ...FRESH,
      });
      return { kind, sizeBytes, pages };
    }
    case 'pdf-too-many-pages': {
      const sizeBytes = 12 * MEGABYTE;
      evaluateUpload({
        mime: 'application/pdf',
        sizeBytes,
        pages: RESOURCE_LIMITS.pdfMaxPages + 1,
        addedBytes: sizeBytes,
        ...FRESH,
      });
      return { kind: 'pdf', sizeBytes, pages: RESOURCE_LIMITS.pdfMaxPages + 1 };
    }
    case 'image-limit': {
      const sizeBytes = RESOURCE_LIMITS.imageMaxBytes;
      const kind = evaluateUpload({
        mime: 'image/png',
        sizeBytes,
        addedBytes: sizeBytes,
        ...FRESH,
      });
      return { kind, sizeBytes, pages: null };
    }
    case 'image-too-large': {
      const sizeBytes = RESOURCE_LIMITS.imageMaxBytes + 1;
      evaluateUpload({ mime: 'image/png', sizeBytes, addedBytes: sizeBytes, ...FRESH });
      return { kind: 'image', sizeBytes, pages: null };
    }
    case 'executable-as-png': {
      // Declared as a PNG, but the real bytes are a Windows executable.
      await detectUpload(EXECUTABLE_BYTES, 'image');
      return { kind: 'image', sizeBytes: EXECUTABLE_BYTES.length, pages: null };
    }
    case 'note-too-long': {
      assertNoteText('x'.repeat(RESOURCE_LIMITS.noteMaxChars + 1));
      return { kind: 'image', sizeBytes: 0, pages: null };
    }
    case 'chapter-full': {
      const sizeBytes = MEGABYTE;
      evaluateUpload({
        mime: 'application/pdf',
        sizeBytes,
        addedBytes: sizeBytes,
        chapterCount: RESOURCE_LIMITS.perChapter,
        usedBytes: 0,
      });
      return { kind: 'pdf', sizeBytes, pages: null };
    }
    case 'quota-reached': {
      const sizeBytes = 10 * MEGABYTE;
      evaluateUpload({
        mime: 'application/pdf',
        sizeBytes,
        addedBytes: sizeBytes,
        chapterCount: 0,
        usedBytes: RESOURCE_LIMITS.userQuotaBytes - MEGABYTE,
      });
      return { kind: 'pdf', sizeBytes, pages: null };
    }
  }
}

export async function simulateUpload(
  _ctx: ServiceContext,
  input: SimulateUploadBody,
): Promise<Result<SimulateUploadOutput>> {
  try {
    return ok({ case: input.case, accepted: true, ...(await simulate(input.case)) });
  } catch (error) {
    if (error instanceof AppError) return err(error);
    throw error;
  }
}
