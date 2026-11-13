import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { decodeProgrammeImport, extractProgrammeText } from './import-file';

// Minimal stored ZIP (no compression) used to exercise the DOCX reader without a Word library.
function storedZip(files: readonly { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.content, 'utf8');
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, data);

    const entry = Buffer.alloc(46 + name.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(0, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    name.copy(entry, 46);
    central.push(entry);
    offset += local.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuffer, eocd]);
}

function minimalPdf(lines: readonly string[]): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td ${lines.map((line) => `(${line}) Tj 0 -16 Td`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

function fileInput(filename: string, bytes: Buffer) {
  return {
    kind: 'file' as const,
    filename,
    contentBase64: bytes.toString('base64'),
  };
}

describe('[SPEC-605] import du programme', () => {
  it('accepte un texte collé et conserve ses lignes', async () => {
    const result = await extractProgrammeText({
      kind: 'text',
      text: 'Module 1 : Comptabilité\nChapitre 1 : Bilan\nNotion : Actif',
    });
    expect(result.kind).toBe('text');
    expect(result.text).toContain('Chapitre 1 : Bilan');
    expect(result.originalContent).toBeNull();
  });

  it('accepte TXT et MD', async () => {
    for (const filename of ['programme.txt', 'programme.md']) {
      const result = await extractProgrammeText(
        fileInput(filename, Buffer.from('Module 1\nChapitre 1\nNotion 1')),
      );
      expect(result.text).toContain('Chapitre 1');
      expect(result.filename).toBe(filename);
    }
  });

  it('extrait le texte d’un DOCX', async () => {
    const zip = storedZip([
      {
        name: 'word/document.xml',
        content:
          '<w:document><w:body><w:p><w:r><w:t>Module 1 : Comptabilité</w:t></w:r></w:p><w:p><w:r><w:t>Chapitre 1 : Bilan</w:t></w:r></w:p></w:body></w:document>',
      },
    ]);
    const result = await extractProgrammeText(fileInput('programme.docx', zip));
    expect(result.text).toContain('Module 1 : Comptabilité');
    expect(result.text).toContain('Chapitre 1 : Bilan');
  });

  it('extrait le texte d’un PDF', async () => {
    const pdf = minimalPdf(['Module 1 : Comptabilite', 'Chapitre 1 : Bilan']);
    const result = await extractProgrammeText(fileInput('programme.pdf', pdf));
    expect(result.text).toContain('Module 1');
    expect(result.text).toContain('Chapitre 1');
  });

  it('un import vide ou illisible donne une erreur lisible', async () => {
    await expect(extractProgrammeText({ kind: 'text', text: '   ' })).rejects.toMatchObject({
      code: 'TEXT_EMPTY',
    });
    await expect(
      extractProgrammeText(fileInput('programme.docx', Buffer.from('pas un zip'))),
    ).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    await expect(
      extractProgrammeText(fileInput('programme.pdf', Buffer.from('pas un pdf'))),
    ).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    await expect(
      extractProgrammeText(fileInput('programme.exe', Buffer.from('MZ'))),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('conserve le fichier d’origine privé pour une nouvelle tentative', () => {
    const bytes = Buffer.from('Module 1\nChapitre 1');
    const decoded = decodeProgrammeImport(fileInput('programme.txt', bytes));
    expect(decoded.originalContent).toBe(bytes.toString('base64'));
    expect(decoded.originalSize).toBe(bytes.length);
    expect(decoded.filename).toBe('programme.txt');
  });

  it('refuse un fichier trop volumineux', async () => {
    const tooLarge = Buffer.alloc(700_001, 0x41);
    await expect(extractProgrammeText(fileInput('programme.txt', tooLarge))).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('refuse un contenu binaire déguisé en texte', async () => {
    const binary = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await expect(extractProgrammeText(fileInput('programme.txt', binary))).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
