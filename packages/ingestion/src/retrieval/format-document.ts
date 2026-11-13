// Data-tag formatting of a retrieved passage (SPEC-511 EF-4, ET-3; BR-IA-10, ADR-0023).
//
// A passage always reaches a model inside a single `<document>` element. Text is escaped so a
// resource can never close the element or open an instruction outside of it: a literal
// `</document>` becomes `&lt;/document&gt;`. Attributes are escaped too, so a title cannot inject
// an attribute. The tag is built by this module only; callers never concatenate raw titles.
import { DocumentChunk, type RetrievalLocation } from '@learny/contracts';
import { AppError } from '@learny/core';

/** Escapes the character data of a data tag (`&` first, then the two angle brackets). */
export function escapeDocumentText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Escapes an attribute value. Whitespace that would break the attribute (line breaks, tabs) is
 * collapsed to one space; quotes and apostrophes are entity-encoded as well.
 */
export function escapeDocumentAttribute(value: string): string {
  return escapeDocumentText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replace(/[\t\n\r\f\v]+/g, ' ');
}

/** Stable human-readable location shown in the tag and in the demonstration. */
export function formatChunkLocation(location: RetrievalLocation): string {
  const parts: string[] = [];
  if (location.page !== undefined) parts.push(`p. ${String(location.page)}`);
  if (location.startSec !== undefined && location.endSec !== undefined) {
    parts.push(`${String(location.startSec)}–${String(location.endSec)} s`);
  } else if (location.startSec !== undefined) {
    parts.push(`à partir de ${String(location.startSec)} s`);
  } else if (location.endSec !== undefined) {
    parts.push(`jusqu’à ${String(location.endSec)} s`);
  }
  if (location.anchor !== undefined) parts.push(`ancre ${location.anchor}`);
  parts.push(`car. ${String(location.charStart)}–${String(location.charEnd)}`);
  return parts.join(' · ');
}

/**
 * ET-3 — `<document source="…" chunk="…" location="…">text</document>`.
 *
 * The chunk identifier is a UUID (the database primary key of `resource_chunks`); an invalid
 * identifier is refused before a tag is produced. `text` is escaped as character data, never
 * interpreted as markup or as an instruction.
 */
export function formatDocumentChunk(chunk: DocumentChunk): string {
  const parsed = DocumentChunk.safeParse(chunk);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Le passage à formater est invalide.', {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  const value = parsed.data;
  const source = escapeDocumentAttribute(value.source);
  const chunkId = escapeDocumentAttribute(value.chunkId);
  const location = escapeDocumentAttribute(formatChunkLocation(value.location));
  return `<document source="${source}" chunk="${chunkId}" location="${location}">${escapeDocumentText(
    value.text,
  )}</document>`;
}
