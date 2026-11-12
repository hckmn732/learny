import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sddDemos } from '../../app/%5Fdev/sdd/registry';
import { loadSddIndex } from '../../lib/sdd-index';
import { readSddStatus } from '../../lib/sdd-status';
import { proxy } from '../../proxy';

const ENABLED = { ENABLE_SDD_PAGES: 'true', APP_ENV: 'test' };

function statusOf(path: string): number {
  return proxy(new NextRequest(`http://localhost${path}`)).status;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('[SPEC-006] SDD index and guard', () => {
  it.each([
    ['TRUE', 'test'],
    ['1', 'test'],
    ['', 'test'],
    ['true', 'production'],
  ])('answers 404 everywhere with ENABLE_SDD_PAGES=%s and APP_ENV=%s', (flag, env) => {
    vi.stubEnv('ENABLE_SDD_PAGES', flag);
    vi.stubEnv('APP_ENV', env);
    for (const path of ['/_dev', '/_dev/sdd', '/_dev/sdd/SPEC-001', '/_dev/sdd/SPEC-006']) {
      expect(statusOf(path), path).toBe(404);
    }
  });

  it('answers 404 when ENABLE_SDD_PAGES is absent', () => {
    vi.stubEnv('ENABLE_SDD_PAGES', undefined);
    vi.stubEnv('APP_ENV', 'test');
    expect(statusOf('/_dev/sdd')).toBe(404);
  });

  it('lets registered pages through and answers 404 for unknown or malformed ids', () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    vi.stubEnv('APP_ENV', 'test');
    for (const path of ['/_dev/sdd', '/_dev/sdd/SPEC-001', '/_dev/sdd/SPEC-006']) {
      expect(statusOf(path), path).toBe(200);
    }
    for (const path of [
      '/_dev/sdd/SPEC-999',
      '/_dev/sdd/abc',
      '/_dev/sdd/spec-006',
      '/_dev/sdd/SPEC-006/x',
      '/_dev/sdd/..%2F..%2Fprogress',
      '/_dev/other',
    ]) {
      expect(statusOf(path), path).toBe(404);
    }
  });

  it('never reads the progress when the guard refuses', () => {
    const read = vi.fn(readSddStatus);
    expect(loadSddIndex({ ENABLE_SDD_PAGES: 'true', APP_ENV: 'production' }, sddDemos, read)).toBe(
      null,
    );
    expect(loadSddIndex({}, sddDemos, read)).toBe(null);
    expect(read).not.toHaveBeenCalled();
  });

  it('shows a minimal index of the registered demos without SPEC-003 progress', () => {
    const index = loadSddIndex(ENABLED, sddDemos);
    expect(index?.kind).toBe('minimal');
    expect(index?.demos.map((d) => d.id)).toEqual(Object.keys(sddDemos).sort());
  });

  it('keeps the SPEC-003 progress and every registered demo when SPEC-003 is present', () => {
    const index = loadSddIndex(ENABLED, sddDemos, readSddStatus);
    expect(index?.kind).toBe('progress');
    if (index?.kind !== 'progress') return;
    expect(index.status.ok).toBe(true);
    // The registry is incremental: earlier entries are kept next to SPEC-006.
    expect(index.demos.map((d) => d.id)).toEqual(
      expect.arrayContaining(['SPEC-001', 'SPEC-002', 'SPEC-006']),
    );
  });

  it('renders the index with the SPEC-003 tables and links only registered demos', async () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    vi.stubEnv('APP_ENV', 'test');
    const { default: SddIndexPage, metadata } = await import('../../app/%5Fdev/sdd/page');
    const html = renderToStaticMarkup(SddIndexPage());
    expect(html).toContain('Progression SDD');
    expect(html).toContain('data-testid="sdd-index-phases"');
    expect(html).toContain('data-testid="sdd-index-specs"');
    expect(html).toContain('href="/_dev/sdd/SPEC-006"');
    expect(html).toContain('href="/_dev/sdd/SPEC-101"');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('builds no file path from the requested id', () => {
    // The dynamic page only looks the validated id up in the in-memory registry.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, '../../app/%5Fdev/sdd/[specId]/page.tsx'), 'utf8');
    expect(source).not.toMatch(/node:fs|readFile|path\.join/);
    expect(source).toContain('findSddDemo(specId, sddDemos)');
  });
});
