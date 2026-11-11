#!/usr/bin/env node
// Collecte les preuves d'une spécification dans evidence/<SPEC>/ (rapports, vidéos, captures, comparaisons visuelles).
// Utilisable seul : node tools/sdd/evidence.mjs SPEC-xxx
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headCommit, nowIso, P, ROOT, shOk, specCriteria } from './lib.mjs';

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function collectEvidence(spec, resultsDir = path.join(ROOT, 'test-results', 'sdd', spec.id)) {
  const dir = path.join(P.evidence, spec.id);
  for (const sub of ['video', 'screenshots', 'visual']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const lines = [];
  for (const f of ['unit.json', 'integration.json', 'e2e.json']) {
    const src = path.join(resultsDir, f);
    if (fs.existsSync(src)) copy(src, path.join(dir, f));
  }
  const junit = path.join(ROOT, 'test-results', 'playwright.xml');
  if (fs.existsSync(junit)) copy(junit, path.join(dir, 'e2e.xml'));

  const pw = path.join(resultsDir, 'e2e.json');
  const videos = [];
  if (fs.existsSync(pw)) {
    let i = 0;
    const walk = (suite) => {
      for (const sp of suite.specs ?? []) {
        if (!sp.title.includes(`@${spec.id}`) && !(sp.tags ?? []).includes(`@${spec.id}`)) continue;
        for (const t of sp.tests ?? []) for (const r of t.results ?? []) for (const a of r.attachments ?? []) {
          if (!a.path || !fs.existsSync(a.path)) continue;
          i += 1;
          const base = `${String(i).padStart(2, '0')}-${sp.title.replace(/@\S+/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;
          if (a.name === 'video') {
            const dest = path.join(dir, 'video', `${base}.webm`);
            copy(a.path, dest);
            videos.push(dest);
          } else if (a.contentType === 'image/png') {
            const sub = /visual|reference|diff|side/i.test(a.name) ? 'visual' : 'screenshots';
            copy(a.path, path.join(dir, sub, `${base}-${a.name.replace(/[^a-z0-9-]+/gi, '-')}.png`));
          }
        }
      }
      for (const sub of suite.suites ?? []) walk(sub);
    };
    for (const su of JSON.parse(fs.readFileSync(pw, 'utf8')).suites ?? []) walk(su);
  }

  const lfs = shOk('git lfs version').ok;
  if (!lfs && videos.length) {
    const exclude = path.join(ROOT, '.git', 'info', 'exclude');
    if (fs.existsSync(path.dirname(exclude))) {
      const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
      if (!cur.includes('evidence/**/*.webm')) fs.appendFileSync(exclude, '\nevidence/**/*.webm\n');
    }
  }
  for (const v of videos) lines.push(`- \`${path.relative(dir, v).replaceAll('\\', '/')}\` — SHA-256 ${sha256(v)}${lfs ? '' : ' (hors Git : Git LFS indisponible, ADR-0050)'}`);

  const acc = path.join(dir, 'acceptance.md');
  if (!fs.existsSync(acc)) {
    const crit = specCriteria(spec);
    fs.writeFileSync(acc, `# ${spec.id} — critères d'acceptation\n\nRemplacer ⬜ par ✅ (ou ❌) et indiquer la preuve (test, capture, mesure) pour chaque critère.\n\n${crit.map((c) => `- ⬜ ${c} — preuve : `).join('\n')}\n`, 'utf8');
  }

  const summary = `# Preuves — ${spec.id} : ${spec.title}\n\n- Date : ${nowIso()}\n- Commit : ${headCommit() || 'n/a'}\n- Spécification : \`${spec.path}\`\n\n## Rapports\n\n- \`unit.json\`, \`integration.json\` (Vitest), \`e2e.json\`, \`e2e.xml\` (Playwright), \`checks.json\` (résultat des validations)\n- \`acceptance.md\` (critères d'acceptation)\n\n## Vidéos\n\n${lines.join('\n') || '- aucune'}\n\n## Captures\n\n- \`screenshots/\` : captures finales des tests\n- \`visual/\` : comparaisons maquette ↔ application et diff\n`;
  fs.writeFileSync(path.join(dir, 'summary.md'), summary, 'utf8');
  return { dir, videos: videos.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadCatalog, argSpec } = await import('./lib.mjs');
  const spec = argSpec(loadCatalog());
  const r = collectEvidence(spec);
  console.log(`Preuves écrites dans ${path.relative(ROOT, r.dir)} (${r.videos} vidéo(s)).`);
}
