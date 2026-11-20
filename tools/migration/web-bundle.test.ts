import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const NEXT = path.join(ROOT, 'apps', 'web', '.next');
const SERVER_PACKAGE =
  /packages[\\/](db|services|jobs|llm|tutor|ingestion|automations|notifications|http|api-routes)[\\/]/u;

function filesUnder(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else result.push(file);
    }
  };
  visit(root);
  return result;
}

describe('[SPEC-1203] web bundle', () => {
  it('ne référence aucun module de paquet serveur dans les traces et standalone', () => {
    const traces = filesUnder(NEXT).filter((file) => file.endsWith('.nft.json'));
    expect(traces.length, 'construire apps/web avant le contrôle').toBeGreaterThan(0);
    const standalone = filesUnder(path.join(NEXT, 'standalone')).filter((file) =>
      /\.(?:cjs|html|js|json|mjs|txt)$/u.test(file),
    );
    const inspected = [...traces, ...standalone];
    const offenders = inspected.filter((file) =>
      SERVER_PACKAGE.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});
