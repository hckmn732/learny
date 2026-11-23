// Deterministic binary fixtures of the upload tests (SPEC-206 §12): a valid PDF with an exact page
// count and an exact byte size, and minimal images whose first bytes are the real signatures.
// Nothing here is a private contribution: the content is synthetic and zero-filled.

const encoder = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function assemblePdf(pages: number, padding: number): Uint8Array {
  const objects: Uint8Array[] = [];
  const kids = Array.from({ length: pages }, (_, index) => `${String(index + 3)} 0 R`).join(' ');
  objects.push(encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(encoder.encode(`<< /Type /Pages /Kids [${kids}] /Count ${String(pages)} >>`));
  for (let index = 0; index < pages; index += 1) {
    objects.push(encoder.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'));
  }
  if (padding > 0) {
    objects.push(
      concat([
        encoder.encode(`<< /Length ${String(padding)} >>\nstream\n`),
        new Uint8Array(padding),
        encoder.encode('\nendstream'),
      ]),
    );
  }

  const header = encoder.encode('%PDF-1.4\n');
  const parts: Uint8Array[] = [header];
  const offsets: number[] = [];
  let position = header.length;
  objects.forEach((body, index) => {
    const open = encoder.encode(`${String(index + 1)} 0 obj\n`);
    const close = encoder.encode('\nendobj\n');
    offsets.push(position);
    parts.push(open, body, close);
    position += open.length + body.length + close.length;
  });
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`);
  const xref =
    `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${entries.join('')}` +
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n` +
    `startxref\n${String(position)}\n%%EOF\n`;
  parts.push(encoder.encode(xref));
  return concat(parts);
}

/** Valid PDF of `pages` pages; `totalBytes` pads it with a zero-filled stream to an exact size. */
export function buildPdf(options: { pages: number; totalBytes?: number }): Uint8Array {
  const base = assemblePdf(options.pages, 0);
  const target = options.totalBytes;
  if (target === undefined) return base;
  if (target < base.length) throw new Error(`PDF trop court : ${String(base.length)} octets min.`);
  let padding = target - base.length;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const built = assemblePdf(options.pages, padding);
    if (built.length === target) return built;
    padding += target - built.length;
  }
  throw new Error('Taille de PDF inatteignable.');
}

// Signature, IHDR (1×1 pixel, 8-bit RGB) and IEND of a PNG: file-type reads the first chunk too.
const PNG_SIGNATURE = Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const WEBP_SIGNATURE = [
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
];
const HEIC_SIGNATURE = [
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31,
  0x68, 0x65, 0x69, 0x63,
];
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00];
// `MZ` header of a Windows executable, renamed `.png` by the hostile case of CL-2.
const EXECUTABLE_SIGNATURE = [
  0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00,
];

export type FakeImageFormat = 'png' | 'jpeg' | 'webp' | 'heic' | 'gif' | 'exe';

const SIGNATURES: Record<FakeImageFormat, number[]> = {
  png: PNG_SIGNATURE,
  jpeg: JPEG_SIGNATURE,
  webp: WEBP_SIGNATURE,
  heic: HEIC_SIGNATURE,
  gif: GIF_SIGNATURE,
  exe: EXECUTABLE_SIGNATURE,
};

/** Bytes whose first bytes are the real signature of `format`, zero-filled to `totalBytes`. */
export function buildImage(format: FakeImageFormat, totalBytes?: number): Uint8Array {
  const signature = SIGNATURES[format];
  const length = Math.max(totalBytes ?? signature.length + 32, signature.length);
  const out = new Uint8Array(length);
  out.set(signature, 0);
  return out;
}
