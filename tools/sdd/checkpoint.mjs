#!/usr/bin/env node
// Exécute un checkpoint de fin de phase : vérifie que la phase est complète, rejoue toutes les suites,
// enregistre le rapport dans evidence/checkpoints/CP-n/, met à jour l'état et pose les tags Git.
// Usage : node tools/sdd/checkpoint.mjs CP-n
import fs from 'node:fs';
import path from 'node:path';
import { die, hasRemoteOrigin, isGitRepo, loadCatalog, loadState, nowIso, P, ROOT, run, saveState, shOk, writeFileAtomic } from './lib.mjs';
import { renderProgress } from './status.mjs';

const catalog = loadCatalog();
const st = loadState(catalog);
const cpId = process.argv[2];
const phase = catalog.phases.find((p) => p.checkpoint === cpId);
if (!phase) die(`Checkpoint inconnu : ${cpId}`);
const idx = catalog.phases.indexOf(phase);
if (idx > 0 && st.checkpoints[catalog.phases[idx - 1].checkpoint].status !== 'passed') die('Le checkpoint précédent n\'est pas réussi.');
const specs = catalog.specs.filter((s) => s.phase === phase.id);
const notDone = specs.filter((s) => st.specs[s.id].status !== 'done');
if (notDone.length) die(`Spécifications non terminées : ${notDone.map((s) => s.id).join(', ')}`);

const crossBrowser = ['CP-6', 'CP-7', 'CP-8', 'CP-9'].includes(cpId);
const steps = [
  ['audit', 'node tools/sdd/audit.mjs'],
  ['lint', 'pnpm -s lint'],
  ['typecheck', 'pnpm -s typecheck'],
  ['build', 'pnpm -s build'],
  ['unit+coverage', 'pnpm -s test:unit --coverage'],
  ['integration', 'pnpm -s test:int'],
  ['e2e (non-régression complète)', 'pnpm -s test:e2e'],
];
if (crossBrowser) steps.push(['cross-browser', 'pnpm -s test:e2e --project=cross-browser']);
if (cpId === 'CP-8' || cpId === 'CP-9') steps.push(['performances', 'pnpm -s test:perf']);

const results = [];
for (const [name, cmd] of steps) {
  const code = run(cmd);
  results.push({ name, cmd, ok: code === 0 });
}
const ok = results.every((r) => r.ok);
const dir = path.join(P.evidence, 'checkpoints', cpId);
fs.mkdirSync(dir, { recursive: true });
const report = `# Checkpoint ${cpId} — ${phase.title}\n\n- Date : ${nowIso()}\n- Résultat : ${ok ? '✅ réussi' : '❌ échec'}\n- Spécifications de la phase : ${specs.map((s) => s.id).join(', ')}\n\n| Contrôle | Commande | Résultat |\n|---|---|---|\n${results.map((r) => `| ${r.name} | \`${r.cmd}\` | ${r.ok ? '✅' : '❌'} |`).join('\n')}\n\nCritères fonctionnels : voir specs/checkpoints.md (${cpId}).\n`;
writeFileAtomic(path.join(dir, 'summary.md'), report);

const cp = st.checkpoints[cpId];
cp.status = ok ? 'passed' : 'failed';
cp.at = nowIso();
cp.report = path.relative(ROOT, path.join(dir, 'summary.md')).replaceAll('\\', '/');
if (ok && isGitRepo()) {
  const tag = cpId.toLowerCase();
  const version = cpId === 'CP-8' ? 'v1.0.0' : cpId === 'CP-9' ? 'v2.0.0' : `v0.${idx}.0`;
  cp.tag = `${tag} ${version}`;
  saveState(st);
  renderProgress(catalog, st);
  shOk('node tools/sdd/changelog.mjs ' + version);
  shOk('git add -A progress evidence/checkpoints CHANGELOG.md');
  shOk(`git commit -m "chore(${cpId}): checkpoint ${cpId} réussi" -m "Phase ${phase.id} — ${phase.title}"`);
  shOk(`git tag -a ${tag} -m "Checkpoint ${cpId}"`);
  shOk(`git tag -a ${version} -m "Version ${version}"`);
  if (hasRemoteOrigin() && process.env.SDD_PUSH !== '0') shOk('git push origin main --follow-tags');
} else {
  saveState(st);
  renderProgress(catalog, st);
}
console.log(ok ? `✔ ${cpId} réussi.` : `✖ ${cpId} en échec : corriger (fix/<SPEC>) puis relancer. Rapport : ${cp.report}`);
process.exit(ok ? 0 : 1);
