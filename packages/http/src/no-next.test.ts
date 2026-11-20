import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [full]
      : [];
  });
}

describe('[SPEC-1003] no next import', () => {
  it('reste indépendant des objets et imports Next (CA-1)', () => {
    const source = sourceFiles(SRC)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/from\s+['"]next(?:\/|['"])/);
    expect(source).not.toMatch(/import\s*\(\s*['"]next(?:\/|['"])/);
    expect(source).not.toContain('NextRequest');
    expect(source).not.toContain('.nextUrl');
  });
});
