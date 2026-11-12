// Streaming ZIP writer of the personal-data export (SPEC-211 ET-2: bounded memory).
//
// The archive is written to a temporary file through `archiver`; apports are read one at a time
// from Storage, so a learner with 2 GB of apports never holds more than one file (at most 50 MB)
// plus the compressor window in memory. The temporary file is removed by the caller.
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import archiver from 'archiver';

import type { ArchiveEntry } from './zip-layout';

/** Reads one Storage object on behalf of the export job; `null` when it disappeared. */
export type ArchiveObjectReader = (storagePath: string) => Promise<Uint8Array | null>;

export interface WrittenArchive {
  filePath: string;
  sizeBytes: number;
  entries: string[];
}

/** Writes `entries` to a fresh temporary ZIP file and returns its path and size. */
export async function writeArchiveFile(
  entries: ArchiveEntry[],
  readObject: ArchiveObjectReader,
): Promise<WrittenArchive> {
  const directory = await mkdtemp(path.join(tmpdir(), 'learny-export-'));
  const filePath = path.join(directory, 'export.zip');
  const output = createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  const closed = pipeline(archive, output);
  try {
    for (const entry of entries) {
      if (typeof entry.text === 'string') {
        archive.append(entry.text, { name: entry.name });
        continue;
      }
      if (typeof entry.storagePath === 'string') {
        const bytes = await readObject(entry.storagePath);
        // A blob removed between the collection and the zip is skipped: the archive stays valid
        // and the deletion is the learner's own action (CL-3).
        if (bytes === null) continue;
        archive.append(Readable.from([bytes]), { name: entry.name });
      }
    }
    await archive.finalize();
    await closed;
    const info = await stat(filePath);
    return { filePath, sizeBytes: info.size, entries: entries.map((entry) => entry.name) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Removes the temporary directory of a written archive (idempotent). */
export async function removeArchiveFile(filePath: string): Promise<void> {
  await rm(path.dirname(filePath), { recursive: true, force: true });
}
