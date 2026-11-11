import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { e2eVerdict, summarizePlaywright, visualVerdict } from '../../../../tools/sdd/core.mjs';
import { collectEvidence, sha256 } from '../../../../tools/sdd/evidence.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SPEC = {
  id: 'SPEC-004',
  title: 'Socle de tests complet et collecte des preuves',
  path: 'specs/p0-fondations/SPEC-004-socle-de-tests-complet-et-collecte-des-preuves.md',
};

interface Attachment {
  name: string;
  contentType: string;
  path?: string;
}
interface Report {
  suites: { specs?: { title: string; tests: { results: { attachments: Attachment[] }[] }[] }[] }[];
}

let tmp: string;
let resultsDir: string;
let junit: string;
let run: { code: number; out: string };
let report: Report;

function attachments(r: Report): Attachment[] {
  const all: Attachment[] = [];
  const walk = (suite: Report['suites'][number] & { suites?: Report['suites'] }) => {
    for (const sp of suite.specs ?? [])
      for (const t of sp.tests) for (const res of t.results) all.push(...res.attachments);
    for (const sub of suite.suites ?? []) walk(sub);
  };
  for (const s of r.suites) walk(s);
  return all;
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-evidence-'));
  resultsDir = path.join(tmp, 'results');
  fs.mkdirSync(resultsDir);
  junit = path.join(tmp, 'playwright.xml');
  // Real Playwright run of the demo page, with the fixed clock and its own report paths.
  const r = spawnSync(
    'node',
    [
      'apps/web/e2e/run-playwright.mjs',
      '--grep',
      'inspecte le socle de tests',
      '--project=desktop',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(resultsDir, 'e2e.json'),
        PLAYWRIGHT_JUNIT_OUTPUT_FILE: junit,
      },
    },
  );
  run = { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
  report = JSON.parse(fs.readFileSync(path.join(resultsDir, 'e2e.json'), 'utf8')) as Report;
}, 300000);

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('[SPEC-004] evidence', () => {
  it('runs Playwright with the fixed clock and produces JSON, JUnit, video and trace (CA-1, CA-2)', () => {
    expect(run.code, run.out).toBe(0);
    expect(fs.readFileSync(junit, 'utf8')).toContain('inspecte le socle de tests @SPEC-004');
    const names = attachments(report).map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['video', 'trace', 'screenshot', 'axe']));
    const summary = summarizePlaywright(report, 'SPEC-004');
    expect(summary).toMatchObject({ passed: 1, failed: 0 });
    // One video per page of the test (axe opens a helper page in the same context).
    expect(summary.videos).toBe(names.filter((n) => n === 'video').length);
    expect(summary.videos).toBeGreaterThan(0);
    expect(e2eVerdict(run.code, summary)).toBe(true);
  });

  it('collects only real artefacts and fingerprints the video (CA-4)', () => {
    const evidenceRoot = path.join(tmp, 'evidence-nolfs');
    const gitInfo = path.join(tmp, 'git-info');
    fs.mkdirSync(gitInfo);
    const r = collectEvidence(SPEC, resultsDir, {
      evidenceRoot,
      junit,
      lfs: false,
      gitInfoDir: gitInfo,
    });

    expect(r.copied.reports).toEqual(['e2e.json', 'e2e.xml']);
    const videos = attachments(report).filter((a) => a.name === 'video');
    expect(r.copied.videos).toHaveLength(videos.length);
    const summary = fs.readFileSync(path.join(r.dir, 'summary.md'), 'utf8');
    for (const video of r.copied.videos) {
      expect(path.basename(video)).toMatch(/^\d{2}-inspecte-le-socle-de-tests-desktop\.webm$/);
      expect(summary).toContain(`SHA-256 ${sha256(video)} (hors Git`);
    }
    expect(r.copied.screenshots.map((f) => path.basename(f).replace(/^\d{2}-/, '')).sort()).toEqual(
      [
        'inspecte-le-socle-de-tests-desktop-screenshot.png',
        'inspecte-le-socle-de-tests-desktop-spec-004-final.png',
      ],
    );
    expect(r.copied.attachments.map((f) => path.basename(f).replace(/^\d{2}-/, ''))).toEqual([
      'inspecte-le-socle-de-tests-desktop-axe.json',
    ]);
    expect(fs.readdirSync(path.join(r.dir, 'video'))).toHaveLength(videos.length);
    expect(fs.readFileSync(path.join(gitInfo, 'exclude'), 'utf8')).toContain('evidence/**/*.webm');
    // The source video stays on disk.
    expect(fs.existsSync(videos[0]?.path ?? '')).toBe(true);
    const acceptance = fs.readFileSync(path.join(r.dir, 'acceptance.md'), 'utf8');
    for (const ca of ['CA-1', 'CA-2', 'CA-3', 'CA-4', 'CA-5'])
      expect(acceptance).toContain(`⬜ ${ca}`);
  });

  it('keeps videos in Git when Git LFS is present (ADR-0050)', () => {
    const gitInfo = path.join(tmp, 'git-info-lfs');
    fs.mkdirSync(gitInfo);
    const r = collectEvidence(SPEC, resultsDir, {
      evidenceRoot: path.join(tmp, 'evidence-lfs'),
      junit,
      lfs: true,
      gitInfoDir: gitInfo,
    });
    expect(fs.readFileSync(path.join(r.dir, 'summary.md'), 'utf8')).not.toContain('hors Git');
    expect(fs.existsSync(path.join(gitInfo, 'exclude'))).toBe(false);
  });

  it('never invents a missing attachment and fails validation without video (CL-6)', () => {
    const stripped = JSON.parse(JSON.stringify(report)) as Report;
    for (const s of stripped.suites)
      for (const sp of s.specs ?? [])
        for (const t of sp.tests)
          for (const res of t.results)
            res.attachments = res.attachments.filter((a) => a.name !== 'video');
    const noVideoDir = path.join(tmp, 'results-novideo');
    fs.mkdirSync(noVideoDir);
    fs.writeFileSync(path.join(noVideoDir, 'e2e.json'), JSON.stringify(stripped));

    const summary = summarizePlaywright(stripped, 'SPEC-004');
    expect(summary.videos).toBe(0);
    expect(e2eVerdict(0, summary)).toBe(false);
    expect(visualVerdict(summary)).toBe(false);
    const r = collectEvidence(SPEC, noVideoDir, {
      evidenceRoot: path.join(tmp, 'evidence-novideo'),
      junit: path.join(tmp, 'absent.xml'),
      lfs: false,
      gitInfoDir: null,
    });
    expect(r.videos).toBe(0);
    expect(fs.readdirSync(path.join(r.dir, 'video'))).toEqual([]);
    expect(r.copied.reports).toEqual(['e2e.json']);
    expect(fs.readFileSync(path.join(r.dir, 'summary.md'), 'utf8')).toContain(
      '## Vidéos\n\n- aucune',
    );
  });
});
