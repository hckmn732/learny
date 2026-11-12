// Pre-commit secret detection: gitleaks when installed, plus the built-in scanner (ADR-0103).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  isForbiddenSecretFile,
  scanText,
  type Finding,
} from '../../packages/config/src/secret-patterns';

type Mode = { kind: 'staged' } | { kind: 'all' } | { kind: 'path'; file: string };

const REFUSAL =
  "Commit refusé : secret détecté. Retirez-le, utilisez une variable d'environnement (voir .env.example).";
const BINARY_PROBE_BYTES = 8000;
/** Absolute path: hooks run from temporary repositories during tests (CL-3). */
const GITLEAKS_CONFIG = path.resolve(import.meta.dirname, '..', '..', '.gitleaks.toml');

function git(args: string[]): string {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} a échoué : ${r.stderr}`);
  return r.stdout;
}

function parseMode(argv: string[]): Mode {
  if (argv.includes('--all')) return { kind: 'all' };
  const i = argv.indexOf('--path');
  if (i >= 0) {
    const file = argv[i + 1];
    if (!file) throw new Error('--path attend un fichier');
    return { kind: 'path', file };
  }
  return { kind: 'staged' };
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, BINARY_PROBE_BYTES).includes(0);
}

function gitleaksVersion(): [number, number] | null {
  const r = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const m = /(\d+)\.(\d+)/.exec(r.stdout);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function runGitleaks(mode: Mode): boolean {
  const version = gitleaksVersion();
  if (!version) {
    console.error('gitleaks introuvable : analyse intégrée uniquement.');
    return true;
  }
  const modern = version[0] > 8 || (version[0] === 8 && version[1] >= 19);
  const config = ['--config', GITLEAKS_CONFIG];
  let args: string[];
  if (mode.kind === 'staged') {
    args = modern
      ? ['git', '--staged', '--redact', '--no-banner', ...config]
      : ['protect', '--staged', '--redact', '--no-banner', ...config];
  } else {
    const target = mode.kind === 'path' ? mode.file : '.';
    args = ['dir', target, '--redact', ...config];
  }
  return spawnSync('gitleaks', args, { stdio: 'inherit' }).status === 0;
}

// Added lines of the staged diff, grouped by file with their line numbers.
function stagedAdditions(): Map<string, { line: number; text: string }[]> {
  const diff = git(['diff', '--cached', '--no-color', '-U0', '--diff-filter=ACMR']);
  const byFile = new Map<string, { line: number; text: string }[]>();
  let file: string | null = null;
  let line = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const target = raw.slice(4);
      file = target === '/dev/null' ? null : target.replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('Binary files ')) {
      file = null;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (file && raw.startsWith('+')) {
      const list = byFile.get(file) ?? [];
      list.push({ line, text: raw.slice(1) });
      byFile.set(file, list);
      line += 1;
    }
  }
  return byFile;
}

function scanFile(file: string): Finding[] {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return [];
  const buf = fs.readFileSync(file);
  if (isBinary(buf)) return [];
  return scanText(buf.toString('utf8'), file);
}

function forbiddenFile(file: string): Finding {
  return { file, line: 0, rule: 'forbidden-file', preview: `${path.basename(file).slice(0, 4)}…` };
}

function builtInScan(mode: Mode): Finding[] {
  const findings: Finding[] = [];
  if (mode.kind === 'staged') {
    const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
      .split('\n')
      .filter(Boolean);
    for (const f of staged) if (isForbiddenSecretFile(f)) findings.push(forbiddenFile(f));
    for (const [file, lines] of stagedAdditions()) {
      for (const { line, text } of lines) {
        for (const f of scanText(text, file)) findings.push({ ...f, line });
      }
    }
    return findings;
  }
  const files =
    mode.kind === 'all' ? git(['ls-files', '-z']).split('\0').filter(Boolean) : [mode.file];
  for (const file of files) {
    if (isForbiddenSecretFile(file)) findings.push(forbiddenFile(file));
    else findings.push(...scanFile(file));
  }
  return findings;
}

function main(): number {
  const mode = parseMode(process.argv.slice(2));
  const gitleaksOk = runGitleaks(mode);
  const findings = builtInScan(mode);
  for (const f of findings) console.error(`${f.file}:${String(f.line)} ${f.rule} ${f.preview}`);
  if (findings.length > 0 || !gitleaksOk) {
    console.error(REFUSAL);
    return 1;
  }
  console.log('Aucun secret détecté.');
  return 0;
}

process.exit(main());
