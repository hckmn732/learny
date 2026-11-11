#!/usr/bin/env node
// Exécute toutes les validations obligatoires d'une spécification et collecte les preuves.
// Usage : node tools/sdd/validate.mjs SPEC-xxx [--skip-build]
import fs from 'node:fs';
import path from 'node:path';
import { argSpec, die, loadCatalog, loadState, nowIso, P, ROOT, run, saveState, specCriteria, writeFileAtomic } from './lib.mjs';
import { collectEvidence } from './evidence.mjs';

const catalog = loadCatalog();
const st = loadState(catalog);
const spec = argSpec(catalog);
const s = st.specs[spec.id];
if (s.status !== 'in_progress') die(`${spec.id} doit être en cours (node tools/sdd/start.mjs ${spec.id}).`);

const pkg = path.join(ROOT, 'package.json');
if (!fs.existsSync(pkg)) die('package.json absent : SPEC-001 doit créer le monorepo et ses scripts.');
const scripts = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts ?? {};
for (const k of ['lint', 'typecheck', 'build', 'test:unit', 'test:int', 'test:e2e']) {
  if (!scripts[k]) die(`Script pnpm manquant : ${k} (voir docs/engineering/testing.md).`);
}

const out = path.join(ROOT, 'test-results', 'sdd', spec.id);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const tag = spec.id;
const results = {};
const record = (name, ok, details = '') => {
  results[name] = { status: ok ? 'passed' : 'failed', at: nowIso(), details };
  console.log(`${ok ? '✔' : '✖'} ${name}${details ? ` — ${details}` : ''}`);
};

record('lint', run('pnpm -s lint') === 0);
record('typecheck', run('pnpm -s typecheck') === 0);
if (!process.argv.includes('--skip-build')) record('build', run('pnpm -s build') === 0);

function vitest(kind, script) {
  const file = path.join(out, `${kind}.json`);
  const code = run(`pnpm -s ${script} -t "${tag}" --reporter=default --reporter=json --outputFile.json="${file}"`);
  let n = 0;
  let failed = 0;
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const f of j.testResults ?? []) for (const a of f.assertionResults ?? []) {
      const full = [...(a.ancestorTitles ?? []), a.title].join(' ');
      if (!full.includes(`[${tag}]`)) continue;
      if (a.status === 'passed') n += 1;
      else if (a.status === 'failed') failed += 1;
    }
  }
  record(kind, code === 0 && failed === 0 && n > 0, `${n} test(s) [${tag}] réussi(s), ${failed} échec(s)`);
}
vitest('unit', 'test:unit');
vitest('integration', 'test:int');

const pwJson = path.join(out, 'e2e.json');
const e2eCode = run(`pnpm -s test:e2e --grep "@${tag}"`, { PLAYWRIGHT_JSON_OUTPUT_FILE: pwJson, PLAYWRIGHT_JSON_OUTPUT_NAME: pwJson });
let e2e = { passed: 0, failed: 0, videos: 0, visual: 0 };
if (fs.existsSync(pwJson)) {
  const walk = (suite) => {
    for (const sp of suite.specs ?? []) {
      if (!sp.title.includes(`@${tag}`) && !(sp.tags ?? []).includes(`@${tag}`)) continue;
      const isVisual = sp.title.includes('@visual') || (sp.tags ?? []).includes('@visual');
      for (const t of sp.tests ?? []) for (const r of t.results ?? []) {
        if (r.status === 'passed') { e2e.passed += 1; if (isVisual) e2e.visual += 1; }
        else if (r.status !== 'skipped') e2e.failed += 1;
        e2e.videos += (r.attachments ?? []).filter((a) => a.name === 'video').length;
      }
    }
    for (const sub of suite.suites ?? []) walk(sub);
  };
  for (const su of JSON.parse(fs.readFileSync(pwJson, 'utf8')).suites ?? []) walk(su);
}
record('e2e', e2eCode === 0 && e2e.failed === 0 && e2e.passed > 0 && e2e.videos > 0, `${e2e.passed} réussi(s), ${e2e.failed} échec(s), ${e2e.videos} vidéo(s)`);
record('visual', e2e.visual > 0 && e2e.failed === 0, `${e2e.visual} test(s) @visual réussi(s) (mode ${spec.visual})`);

collectEvidence(spec, out);

const acc = path.join(P.evidence, spec.id, 'acceptance.md');
const criteria = specCriteria(spec);
let accOk = false;
let accDetail = 'acceptance.md absent';
if (fs.existsSync(acc)) {
  const txt = fs.readFileSync(acc, 'utf8');
  const missing = criteria.filter((c) => !new RegExp(`✅[^\\n]*\\b${c}\\b|\\b${c}\\b[^\\n]*✅`).test(txt));
  const failedLines = (txt.match(/❌/g) ?? []).length;
  accOk = criteria.length >= 3 && missing.length === 0 && failedLines === 0;
  accDetail = `${criteria.length - missing.length}/${criteria.length} critères ✅${missing.length ? ` ; manquants : ${missing.join(', ')}` : ''}${failedLines ? ` ; ${failedLines} ❌` : ''}`;
}
record('acceptance', accOk, accDetail);

s.validations = results;
const allOk = Object.values(results).every((r) => r.status === 'passed');
s.lastError = allOk ? null : Object.entries(results).filter(([, r]) => r.status !== 'passed').map(([k, r]) => `${k}: ${r.details}`).join(' | ');
saveState(st);
writeFileAtomic(path.join(P.evidence, spec.id, 'checks.json'), JSON.stringify(results, null, 2) + '\n');
console.log(allOk ? `\n✔ ${spec.id} : toutes les validations sont réussies.` : `\n✖ ${spec.id} : validations en échec. Corriger puis relancer.`);
process.exit(allOk ? 0 : 1);
