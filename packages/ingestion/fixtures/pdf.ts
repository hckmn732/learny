// Deterministic PDF fixtures of the ingestion (SPEC-509 §12).
//
// The bytes are built in memory from synthetic, public-domain sentences: no private contribution
// and no binary blob in the repository. `buildTextPdf` writes a real PDF with one text stream per
// page, so `unpdf` extracts exactly the given lines and page offsets; `buildEmptyPdf` has pages
// without any text (CL-1) and `corruptedPdf` is not a PDF at all (CL-2).
const encoder = new TextEncoder();

/** WinAnsi octal escape of a non-ASCII character, so the PDF stays ASCII and lengths stay exact. */
function pdfLiteral(value: string): string {
  let out = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (character === '(' || character === ')' || character === '\\') out += `\\${character}`;
    else if (code >= 32 && code <= 126) out += character;
    else if (code <= 255) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

interface PdfPage {
  lines: readonly string[];
  withText: boolean;
}

function assemble(pages: readonly PdfPage[]): Uint8Array {
  const objects: string[] = [];
  const fontObject = 3 + pages.length * 2;
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${String(index + 3)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`,
  );
  for (let index = 0; index < pages.length; index += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${String(fontObject)} 0 R >> >> /Contents ${String(3 + pages.length + index)} 0 R >>`,
    );
  }
  for (const page of pages) {
    const content = page.withText
      ? `BT /F1 12 Tf 72 720 Td ${page.lines
          .map((line, index) => `${index === 0 ? '' : '0 -16 Td '}(${pdfLiteral(line)}) Tj`)
          .join(' ')} ET`
      : '';
    objects.push(`<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const header = '%PDF-1.4\n';
  let body = header;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;
  return encoder.encode(body);
}

/** A real PDF whose pages contain the given lines, in order. */
export function buildTextPdf(pages: readonly (readonly string[])[]): Uint8Array {
  return assemble(pages.map((lines) => ({ lines, withText: true })));
}

/** A PDF with pages but no text at all (scanned-like, CL-1). */
export function buildEmptyPdf(pageCount = 1): Uint8Array {
  return assemble(Array.from({ length: pageCount }, () => ({ lines: [], withText: false })));
}

/** Bytes that start like a PDF header but cannot be parsed (CL-2). */
export function corruptedPdf(): Uint8Array {
  return encoder.encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n');
}

/** Synthetic two-page note used by the demonstration and the end-to-end test. */
export const DEMO_NOTE = [
  'Clés de comptabilisation',
  '',
  'Le compte 401 enregistre les fournisseurs. Le compte 512 enregistre la banque.',
  'Une écriture est équilibrée quand le total des débits égale le total des crédits.',
  '',
  'Contrôle : 120 au débit et 120 au crédit donnent une pièce équilibrée.',
].join('\n');

/** Synthetic two-page PDF of the demonstration and the integration suite. */
export function demoPdf(): Uint8Array {
  return buildTextPdf([
    [
      'Comptabilité générale',
      'Le débit augmente les actifs et les charges.',
      'Le crédit augmente les passifs et les produits.',
      'Une écriture est équilibrée quand le total des débits égale le total des crédits.',
    ],
    [
      'Contrôle des comptes',
      'Le compte 401 enregistre les fournisseurs.',
      'Le compte 512 enregistre la banque.',
      'Rapprochez toujours le solde du compte avec le relevé.',
    ],
  ]);
}
