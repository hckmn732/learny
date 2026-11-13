import { inflateRawSync } from 'node:zlib';

import { extractText, getDocumentProxy } from 'unpdf';

import type { ImportProgrammeInput } from '@learny/contracts';
import { AppError } from '@learny/core';

// Extraction of an imported programme (SPEC-605 EF-2, CL-1). The original bytes never leave the
// server: the service keeps them in `programme_imports.original_content` and only sends the
// extracted text to the tutor. PDF uses PDF.js through `unpdf`; DOCX is a ZIP whose
// `word/document.xml` is read without executing anything; TXT and Markdown are UTF-8 text.

export type DecodedProgrammeImport = {
  kind: 'text' | 'file';
  text: string;
  filename: string | null;
  /** Base64 of the original file, `null` for pasted text. */
  originalContent: string | null;
  originalSize: number | null;
};

const TEXT_LIMIT = 200_000;
const FILE_LIMIT = 700_000;

function unsupported(message: string): AppError {
  return new AppError('UNSUPPORTED_TYPE', message, { status: 422 });
}

function extractionFailed(message: string, cause?: unknown): AppError {
  return new AppError('EXTRACTION_FAILED', message, {
    status: 422,
    ...(cause === undefined ? {} : { cause }),
  });
}

function emptyText(): AppError {
  return new AppError(
    'TEXT_EMPTY',
    'Le programme importé est vide : ajoutez des modules, chapitres ou notions.',
    { status: 422 },
  );
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index + 1).toLowerCase();
}

function decodeBase64(value: string): Buffer {
  const compact = value.replace(/\s+/g, '');
  if (compact.length === 0) throw extractionFailed('Le fichier importé est vide.');
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.length === 0) throw extractionFailed('Le fichier importé est vide.');
  if (bytes.length > FILE_LIMIT) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Le fichier importé dépasse 700 ko.', { status: 413 });
  }
  return bytes;
}

function cleanText(raw: string): string {
  const withoutBom = raw.replace(/^\uFEFF/, '');
  if (withoutBom.includes('\u0000')) {
    throw extractionFailed('Le fichier importé contient des données binaires illisibles.');
  }
  const normalized = withoutBom
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (normalized === '') throw emptyText();
  if (normalized.length > TEXT_LIMIT) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Le programme importé dépasse 200 000 caractères.', {
      status: 413,
    });
  }
  const replacements = (normalized.match(/\uFFFD/g) ?? []).length;
  if (replacements > normalized.length * 0.02) {
    throw extractionFailed('Le texte du fichier n’est pas lisible en UTF-8.');
  }
  return normalized;
}

function decodeText(bytes: Buffer): string {
  const text = bytes.toString('utf8');
  let controls = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) controls += 1;
  }
  if (controls > Math.max(4, text.length * 0.02)) {
    throw extractionFailed('Le fichier importé n’est pas un texte lisible.');
  }
  return cleanText(text);
}

function xmlText(xml: string): string {
  return cleanText(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'")
      .replaceAll('&amp;', '&'),
  );
}

function docxDocumentXml(bytes: Buffer): string {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) {
    throw extractionFailed('Ce fichier n’est pas un document Word valide.');
  }
  // Central directory: robust against data descriptors written by Word.
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === eocdSignature) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw extractionFailed('Ce document Word est endommagé.');
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw extractionFailed('Ce document Word est endommagé.');
    }
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === 'word/document.xml') {
      if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
        throw extractionFailed('Ce document Word est endommagé.');
      }
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data.toString('utf8');
      if (method === 8) {
        try {
          return inflateRawSync(data).toString('utf8');
        } catch (error) {
          throw extractionFailed('Le contenu de ce document Word est illisible.', error);
        }
      }
      throw extractionFailed('Ce document Word utilise une compression non prise en charge.');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw extractionFailed('Ce document Word ne contient pas de texte lisible.');
}

async function pdfText(bytes: Buffer): Promise<string> {
  let document;
  try {
    document = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch (error) {
    throw extractionFailed('Ce PDF est illisible ou endommagé.', error);
  }
  try {
    const extracted = await extractText(document, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join('\n\n') : extracted.text;
    return cleanText(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw extractionFailed('Ce PDF ne contient aucun texte lisible.', error);
  } finally {
    await document.loadingTask.destroy();
  }
}

/** Decodes the API input and keeps the original file private for a later retry. */
export function decodeProgrammeImport(input: ImportProgrammeInput): DecodedProgrammeImport {
  if (input.kind === 'text') {
    const text = cleanText(input.text);
    return { kind: 'text', text, filename: null, originalContent: null, originalSize: null };
  }
  const bytes = decodeBase64(input.contentBase64);
  return {
    kind: 'file',
    text: '',
    filename: input.filename,
    originalContent: input.contentBase64.replace(/\s+/g, ''),
    originalSize: bytes.length,
  };
}

/** Extracts the readable programme text, or throws a safe business error. */
export async function extractProgrammeText(
  input: ImportProgrammeInput,
): Promise<DecodedProgrammeImport> {
  const decoded = decodeProgrammeImport(input);
  if (decoded.kind === 'text') return decoded;
  const bytes = decodeBase64(input.kind === 'file' ? input.contentBase64 : '');
  const filename = decoded.filename ?? '';
  const extension = extensionOf(filename);
  let text: string;
  if (extension === 'pdf') {
    if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
      throw extractionFailed('Ce fichier n’est pas un PDF lisible.');
    }
    text = await pdfText(bytes);
  } else if (extension === 'docx') {
    text = xmlText(docxDocumentXml(bytes));
  } else if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    text = decodeText(bytes);
  } else {
    throw unsupported('Importez un fichier PDF, DOCX, TXT ou MD, ou collez le programme.');
  }
  return { ...decoded, text };
}
