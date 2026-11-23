#!/usr/bin/env node
// Exécute les validations obligatoires d'une spécification et collecte les preuves.
// Usage : node tools/sdd/validate.mjs SPEC-xxx [--skip-build] [--only unit,integration,e2e,visual,acceptance]
//
// - lint et typecheck passent toujours en premier (rapides grâce au cache Turbo) ; s'ils échouent,
//   les étapes de test sont marquées « non exécutées » au lieu de tourner pour rien.
// - --only relance uniquement les étapes citées (plus lint, typecheck et acceptance) et conserve
//   les résultats précédents des autres étapes : après un échec, ne relancer que ce qui a échoué.
// - unit et integration ne chargent que les fichiers de test qui contiennent « [SPEC-xxx] »
//   (repli sur tout le projet Vitest si aucun fichier n'est trouvé).
// - Piste `mobile` (SPEC-3001 EF-4) : l'étape unit ajoute Jest (`pnpm test:mobile`), l'étape e2e
//   devient `pnpm test:e2e:mobile --tags SPEC-xxx` et l'étape visual compte les flux `visual`
//   réussis de la campagne Maestro. Les autres pistes gardent exactement le comportement d'avant.
import fs from 'node:fs';
import path from 'node:path';
import {
  argSpec, collectMobileEvidence, die, e2eVerdict, loadCatalog, loadState, maestroVerdict,
  mobileVisualVerdict, nowIso, P, ROOT, run, saveState, shOk, specCriteria, specTrack,
  summarizeJest, summarizeMaestro, summarizePlaywright, validationPlan, visualVerdict,
  writeFileAtomic,
} from './lib.mjs';
import { collectEvidence } from './evidence.mjs';
import {
  parseJunit,
  pytestVerdict,
  selectPythonTests,
  stepSummary,
} from './pytest.mjs';

const STEPS = ['lint', 'typecheck', 'build', 'unit', 'integration', 'e2e', 'visual', 'acceptance'];
const ALWAYS = ['lint', 'typecheck', 'acceptance'];

const catalog = loadCatalog();
const st = loadState(catalog);
const spec = argSpec(catalog);
const s = st.specs[spec.id];
if (s.status !== 'in_progress') die(`${spec.id} doit être en cours (node tools/sdd/start.mjs ${spec.id}).`);

const plan = validationPlan(specTrack(catalog, spec));

const pkg = path.join(ROOT, 'package.json');
if (!fs.existsSync(pkg)) die('package.json absent : SPEC-001 doit créer le monorepo et ses scripts.');
const scripts = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts ?? {};
const REQUIRED_SCRIPTS = [
  'lint', 'typecheck', 'build', 'test:unit', 'test:int', 'test:e2e',
  ...(plan.jest === null ? [] : [plan.jest, plan.e2e]),
];
for (const k of REQUIRED_SCRIPTS) {
  if (!scripts[k]) die(`Script pnpm manquant : ${k} (voir docs/engineering/testing.md).`);
}

const onlyIdx = process.argv.indexOf('--only');
const onlyArg = onlyIdx > 0 ? process.argv[onlyIdx + 1] ?? '' : (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const only = onlyArg ? onlyArg.split(',').map((x) => x.trim()).filter(Boolean) : null;
if (only) {
  const bad = only.filter((x) => !STEPS.includes(x));
  if (bad.length) die(`--only : étape(s) inconnue(s) ${bad.join(', ')} (valeurs : ${STEPS.join(', ')}).`);
}
const wanted = (step) => !only || only.includes(step) || ALWAYS.includes(step) || (step === 'visual' && only.includes('e2e'));
if (only && only.includes('visual') && !only.includes('e2e')) only.push('e2e'); // visual se lit dans la campagne e2e

const out = path.join(ROOT, 'test-results', 'sdd', spec.id);
if (!only) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const tag = spec.id;

/**
 * Fichiers de tests unitaires déjà rouges sur la branche `mobile`, hors périmètre de la piste
 * mobile (décision du porteur, consignée dans `evidence/SPEC-3001/acceptance.md`) : ils sont
 * exécutés et comptés comme les autres, mais leur échec n'invalide pas l'étape `unit` d'une
 * spécification mobile. Aucun autre fichier n'est toléré en échec.
 */
const KNOWN_RED_UNIT = [
  'packages/config/src/commit-rules.test.ts',
  'apps/web/test/unit/bundle-split.test.ts',
  'tools/migration/test/unit/report.test.ts',
];
const results = only ? { ...(s.validations ?? {}) } : {};
const record = (name, ok, details = '') => {
  results[name] = { status: ok ? 'passed' : 'failed', at: nowIso(), details };
  console.log(`${ok ? '✔' : '✖'} ${name}${details ? ` — ${details}` : ''}`);
};
const skip = (name, why) => {
  results[name] = { status: 'failed', at: nowIso(), details: `non exécuté : ${why}` };
  console.log(`⏭ ${name} — non exécuté : ${why}`);
};
const timed = (name, fn) => {
  const t0 = Date.now();
  const r = fn();
  console.log(`⏱ ${name} : ${Math.round((Date.now() - t0) / 1000)} s`);
  return r;
};

record('lint', timed('lint', () => run('pnpm -s lint')) === 0);
record('typecheck', timed('typecheck', () => run('pnpm -s typecheck')) === 0);
if (wanted('build') && !process.argv.includes('--skip-build')) record('build', timed('build', () => run('pnpm -s build')) === 0);
const staticOk = ['lint', 'typecheck', 'build'].every((k) => results[k]?.status !== 'failed' || (k === 'build' && !wanted('build')));

/** Fichiers de test qui contiennent « [SPEC-xxx] » (chemins relatifs à la racine). */
function taggedTestFiles() {
  const r = shOk(`git ls-files -co --exclude-standard -z | xargs -0 grep -lF -- "[${tag}]" 2>/dev/null`);
  return (r.out ?? '').split('\n').map((x) => x.trim())
    .filter((f) => /\.test\.(ts|tsx|mts|js|mjs)$/.test(f) && !f.includes('node_modules'));
}
const tagged = taggedTestFiles();
/** Fichiers de test Python qui contiennent « [SPEC-xxx] » (SPEC-2003). */
function taggedPythonFiles() {
  const r = shOk(
    `git ls-files -co --exclude-standard -z | xargs -0 grep -lF -- "[${tag}]" 2>/dev/null`,
  );
  return (r.out ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter((f) => f.endsWith(".py") && !f.includes("node_modules") && !f.includes("/.venv/"));
}
const pythonTagged = taggedPythonFiles();

/** Exécute un projet Vitest et compte les tests « [SPEC-xxx] » du rapport JSON. */
function vitestRun(kind, script) {
  const file = path.join(out, `${kind}.json`);
  fs.rmSync(file, { force: true });
  const isInt = (f) => /(^|\/)test\/integration\//.test(f) || /\.int\.test\./.test(f);
  // Unitaires : tout le projet (2 à 3 min, attrape les régressions hors de la spec) ;
  // intégration : seulement les fichiers étiquetés (base partagée, plusieurs minutes sinon).
  const files = kind === 'integration' ? tagged.filter(isInt) : [];
  const filter = files.length ? ` ${files.map((f) => JSON.stringify(f)).join(' ')}` : '';
  if (kind === 'integration' && !files.length) console.log(`(aucun fichier ${kind} ne contient [${tag}] : repli sur tout le projet)`);
  const code = timed(kind, () => run(`pnpm -s ${script}${filter}${kind === 'integration' ? ` -t "\\[${tag}\\]"` : ''} --reporter=default --reporter=json --outputFile.json="${file}"`));
  let n = 0;
  let failed = 0;
  const failedFiles = [];
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const f of j.testResults ?? []) {
      const name = path.relative(ROOT, f.name ?? '').replaceAll('\\', '/');
      if ((f.assertionResults ?? []).some((a) => a.status === 'failed')) failedFiles.push(name);
      for (const a of f.assertionResults ?? []) {
        const full = [...(a.ancestorTitles ?? []), a.title].join(' ');
        if (!full.includes(`[${tag}]`)) continue;
        if (a.status === 'passed') n += 1;
        else if (a.status === 'failed') failed += 1;
      }
    }
  }
  // SPEC-2003 CA-3 : les tests pytest étiquetés comptent pour la même étape.
  const pythonFiles = selectPythonTests(pythonTagged, kind);
  let python = { cases: 0, failures: 0, errors: 0, skipped: 0, passed: 0 };
  let pythonCode = 0;
  if (pythonFiles.length) {
    const xml = path.join(out, `py-${kind}.xml`);
    fs.rmSync(xml, { force: true });
    pythonCode = timed(
      `py-${kind}`,
      () =>
        run(
          `uv run pytest ${pythonFiles.map((f) => JSON.stringify(f)).join(" ")} --junitxml=${JSON.stringify(xml)} -q`,
        ),
    );
    if (fs.existsSync(xml)) python = parseJunit(fs.readFileSync(xml, "utf8"));
  }
  const pythonOk = pytestVerdict(pythonCode, python, pythonFiles.length > 0);
  return { code, passed: n, failed, failedFiles, python, hasPython: pythonFiles.length > 0, pythonOk };
}

function vitest(kind, script) {
  const r = vitestRun(kind, script);
  const ok = r.code === 0 && r.failed === 0 && r.pythonOk && (r.passed > 0 || r.python.passed > 0);
  record(kind, ok, stepSummary(r.passed, r.failed, r.python, r.hasPython));
}

/**
 * Exécute Jest (composants et écrans, SPEC-3001 EF-3) : le rapport JSON du projet mobile est
 * copié dans les résultats de la spécification et les tests « [SPEC-xxx] » y sont comptés.
 */
function jestRun(script) {
  const file = path.join(ROOT, 'test-results', 'mobile', 'jest.json');
  fs.rmSync(file, { force: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const code = timed('jest', () => run(`pnpm -s ${script}`));
  let passed = 0;
  let failed = 0;
  if (fs.existsSync(file)) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    const summary = summarizeJest(report, tag);
    passed = summary.passed;
    failed = summary.failed;
    fs.copyFileSync(file, path.join(out, 'jest.json'));
  }
  return { code, passed, failed };
}

if (wanted('unit')) {
  if (!staticOk) {
    skip('unit', 'lint/typecheck/build en échec');
  } else if (plan.jest === null) {
    vitest('unit', 'test:unit');
  } else {
    // Piste mobile : Vitest (logique pure) + Jest (composants), comptés ensemble (EF-4).
    const vitestPart = vitestRun('unit', 'test:unit');
    const jestPart = jestRun(plan.jest);
    const knownRed = vitestPart.failedFiles.filter((file) => KNOWN_RED_UNIT.includes(file));
    const unexpected = vitestPart.failedFiles.filter((file) => !KNOWN_RED_UNIT.includes(file));
    if (knownRed.length > 0) {
      console.log(
        `(fichiers préexistants hors périmètre, non réparés : ${knownRed.join(', ')})`,
      );
    }
    const failed = vitestPart.failed + jestPart.failed;
    record(
      'unit',
      failed === 0 && unexpected.length === 0 && vitestPart.pythonOk && vitestPart.passed + jestPart.passed > 0 && jestPart.code === 0,
      `${vitestPart.passed} Vitest + ${jestPart.passed} Jest test(s) [${tag}] réussi(s), ${failed} échec(s)` +
        `${unexpected.length === 0 ? '' : ` ; fichiers inattendus en échec : ${unexpected.join(', ')}`}`,
    );
  }
}

if (wanted('integration')) {
  if (staticOk) vitest('integration', 'test:int');
  else skip('integration', 'lint/typecheck/build en échec');
}

if (wanted('e2e')) {
  if (!staticOk) {
    skip('e2e', 'lint/typecheck/build en échec');
    skip('visual', 'lint/typecheck/build en échec');
  } else if (plan.e2e === 'test:e2e:mobile') {
    // Campagne Maestro (SPEC-3001 EF-5) : le lanceur écrit test-results/sdd/<SPEC>/e2e-mobile.json.
    const reportPath = path.join(out, plan.e2eReport);
    fs.rmSync(reportPath, { force: true });
    const code = timed('e2e', () => run(`pnpm -s ${plan.e2e} --tags ${tag}`));
    const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
    const summary = summarizeMaestro(report, tag);
    record('e2e', maestroVerdict(code, summary), `${summary.passed} flux réussi(s), ${summary.failed} échec(s), ${summary.videos} vidéo(s)`);
    record('visual', mobileVisualVerdict(summary), `${summary.visual} flux @visual réussi(s) (mode ${spec.visual})`);
  } else {
    const pwJson = path.join(out, 'e2e.json');
    fs.rmSync(pwJson, { force: true });
    const e2eCode = timed('e2e', () => run(`pnpm -s test:e2e --grep "@${tag}\\b"`, { PLAYWRIGHT_JSON_OUTPUT_FILE: pwJson, PLAYWRIGHT_JSON_OUTPUT_NAME: pwJson }));
    const e2e = summarizePlaywright(fs.existsSync(pwJson) ? JSON.parse(fs.readFileSync(pwJson, 'utf8')) : null, tag);
    record('e2e', e2eVerdict(e2eCode, e2e), `${e2e.passed} réussi(s), ${e2e.failed} échec(s), ${e2e.videos} vidéo(s)`);
    record('visual', visualVerdict(e2e), `${e2e.visual} test(s) @visual réussi(s) (mode ${spec.visual})`);
  }
}

const junitFile = plan.e2e === 'test:e2e:mobile' ? path.join(out, 'e2e-mobile.xml') : path.join(ROOT, 'test-results', 'playwright.xml');
collectEvidence(spec, out, { junit: junitFile });
if (plan.e2e === 'test:e2e:mobile') {
  const mobile = collectMobileEvidence(spec, out, P.evidence);
  console.log(
    `preuves mobiles : ${String(mobile.videos)} vidéo(s), ${String(mobile.screenshots)} capture(s), ` +
      `${String(mobile.visual)} comparaison(s) visuelle(s)`,
  );
}

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
const required = ['lint', 'typecheck', 'unit', 'integration', 'e2e', 'visual', 'acceptance'];
const allOk = required.every((k) => results[k]?.status === 'passed') && Object.values(results).every((r) => r.status === 'passed');
const failing = Object.entries(results).filter(([, r]) => r.status !== 'passed');
s.lastError = allOk ? null : failing.map(([k, r]) => `${k}: ${r.details}`).join(' | ');
saveState(st);
writeFileAtomic(path.join(P.evidence, spec.id, 'checks.json'), JSON.stringify(results, null, 2) + '\n');
if (allOk) console.log(`\n✔ ${spec.id} : toutes les validations sont réussies.`);
else {
  const retry = failing.map(([k]) => k).filter((k) => !ALWAYS.includes(k) && k !== 'build');
  console.log(`\n✖ ${spec.id} : validations en échec. Corriger puis relancer${retry.length ? ` uniquement : --only ${retry.join(',')}` : ''}.`);
}
process.exit(allOk ? 0 : 1);
