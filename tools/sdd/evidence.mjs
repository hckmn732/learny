#!/usr/bin/env node
// Collecte les preuves d'une spécification dans evidence/<SPEC>/ (rapports, vidéos, captures, comparaisons visuelles).
// Seuls les fichiers réellement produits sont copiés ; rien n'est inventé (SPEC-004, EF-6).
// Utilisable seul : node tools/sdd/evidence.mjs SPEC-xxx
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headCommit, nowIso, P, ROOT, shOk, specCriteria, writeFileAtomic } from './lib.mjs';

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Nom de fichier stable : sans accents ni étiquettes, en minuscules. */
export function slugify(text) {
  return text.replace(/@\S+/g, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * @param spec       entrée du catalogue (id, title, path)
 * @param resultsDir dossier contenant unit.json, integration.json, e2e.json
 * @param options    { evidenceRoot, junit, lfs, gitInfoDir } — injectables pour les tests
 */
export function collectEvidence(spec, resultsDir = path.join(ROOT, 'test-results', 'sdd', spec.id), options = {}) {
  const evidenceRoot = options.evidenceRoot ?? P.evidence;
  const junit = options.junit ?? path.join(ROOT, 'test-results', 'playwright.xml');
  const lfs = options.lfs ?? shOk('git lfs version').ok;
  const gitInfoDir = options.gitInfoDir === undefined ? path.join(ROOT, '.git', 'info') : options.gitInfoDir;

  const dir = path.join(evidenceRoot, spec.id);
  for (const sub of ['video', 'screenshots', 'visual']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const copied = { reports: [], videos: [], screenshots: [], visual: [], attachments: [] };
  for (const f of ['unit.json', 'integration.json', 'e2e.json']) {
    const src = path.join(resultsDir, f);
    if (fs.existsSync(src)) { copy(src, path.join(dir, f)); copied.reports.push(f); }
  }
  if (fs.existsSync(junit)) { copy(junit, path.join(dir, 'e2e.xml')); copied.reports.push('e2e.xml'); }

  const pw = path.join(resultsDir, 'e2e.json');
  if (fs.existsSync(pw)) {
    let i = 0;
    const walk = (suite) => {
      for (const sp of suite.specs ?? []) {
        if (!sp.title.includes(`@${spec.id}`) && !(sp.tags ?? []).includes(`@${spec.id}`)) continue;
        for (const t of sp.tests ?? []) for (const r of t.results ?? []) for (const a of r.attachments ?? []) {
          // Only attachments that exist on disk are collected.
          if (!a.path || !fs.existsSync(a.path)) continue;
          i += 1;
          const project = t.projectName ? `-${t.projectName}` : '';
          const base = `${String(i).padStart(2, '0')}-${slugify(sp.title)}${project}`;
          if (a.name === 'video') {
            const dest = path.join(dir, 'video', `${base}.webm`);
            copy(a.path, dest);
            copied.videos.push(dest);
          } else if (IMAGE_EXT[a.contentType]) {
            const sub = /visual|reference|diff|side|baseline/i.test(a.name) ? 'visual' : 'screenshots';
            const dest = path.join(dir, sub, `${base}-${slugify(a.name)}.${IMAGE_EXT[a.contentType]}`);
            copy(a.path, dest);
            copied[sub].push(dest);
          } else if (a.contentType === 'application/json') {
            const dest = path.join(dir, 'attachments', `${base}-${slugify(a.name)}.json`);
            copy(a.path, dest);
            copied.attachments.push(dest);
          }
        }
      }
      for (const sub of suite.suites ?? []) walk(sub);
    };
    for (const su of JSON.parse(fs.readFileSync(pw, 'utf8')).suites ?? []) walk(su);
  }

  // Git LFS absent: videos stay on disk, excluded from Git, fingerprint kept (ADR-0050).
  if (!lfs && copied.videos.length && gitInfoDir && fs.existsSync(gitInfoDir)) {
    const exclude = path.join(gitInfoDir, 'exclude');
    const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
    if (!cur.includes('evidence/**/*.webm')) fs.appendFileSync(exclude, '\nevidence/**/*.webm\n');
  }
  const lines = copied.videos.map((v) => `- \`${path.relative(dir, v).replaceAll('\\', '/')}\` — SHA-256 ${sha256(v)}${lfs ? '' : ' (hors Git : Git LFS indisponible, ADR-0050)'}`);

  const acc = path.join(dir, 'acceptance.md');
  if (!fs.existsSync(acc)) {
    const crit = specCriteria(spec);
    writeFileAtomic(acc, `# ${spec.id} — critères d'acceptation\n\nRemplacer ⬜ par ✅ (ou ❌) et indiquer la preuve (test, capture, mesure) pour chaque critère.\n\n${crit.map((c) => `- ⬜ ${c} — preuve : `).join('\n')}\n`);
  }

  const summary = `# Preuves — ${spec.id} : ${spec.title}\n\n- Date : ${nowIso()}\n- Commit : ${headCommit() || 'n/a'}\n- Spécification : \`${spec.path}\`\n\n## Rapports\n\n${copied.reports.map((r) => `- \`${r}\``).join('\n') || '- aucun'}\n- \`checks.json\` (résultat des validations), \`acceptance.md\` (critères d'acceptation)\n\n## Vidéos\n\n${lines.join('\n') || '- aucune'}\n\n## Captures\n\n- \`screenshots/\` : ${copied.screenshots.length} capture(s) finale(s) des tests\n- \`visual/\` : ${copied.visual.length} comparaison(s) maquette ↔ application et diff\n`;
  writeFileAtomic(path.join(dir, 'summary.md'), summary);
  return { dir, videos: copied.videos.length, copied };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadCatalog, argSpec } = await import('./lib.mjs');
  const spec = argSpec(loadCatalog());
  const r = collectEvidence(spec);
  console.log(`Preuves écrites dans ${path.relative(ROOT, r.dir)} (${r.videos} vidéo(s)).`);
}
