#!/usr/bin/env node
// Ajoute au CHANGELOG.md une section pour la version donnée, à partir des commits depuis le dernier tag.
// Usage : node tools/sdd/changelog.mjs vX.Y.Z
import fs from 'node:fs';
import path from 'node:path';
import { die, ROOT, shOk } from './lib.mjs';

const version = process.argv[2];
if (!version) die('Version attendue (ex. v0.1.0).');
const last = shOk('git describe --tags --abbrev=0 --match "v*"');
const range = last.ok ? `${last.out}..HEAD` : 'HEAD';
const log = shOk(`git log ${range} --pretty=format:%s`);
const lines = log.ok ? log.out.split('\n').filter(Boolean) : [];
const groups = { feat: 'Ajouts', fix: 'Corrections', perf: 'Performances', refactor: 'Refactorisations', docs: 'Documentation', test: 'Tests', build: 'Construction', ci: 'Intégration continue' };
let section = `## [${version}] — ${new Date().toISOString().slice(0, 10)}\n\n`;
for (const [type, label] of Object.entries(groups)) {
  const items = lines.filter((l) => l.startsWith(`${type}(`) || l.startsWith(`${type}:`));
  if (items.length) section += `### ${label}\n\n${items.map((i) => `- ${i}`).join('\n')}\n\n`;
}
const file = path.join(ROOT, 'CHANGELOG.md');
const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Journal des modifications\n\nFormat : Keep a Changelog ; versions SemVer.\n\n';
const [head, ...rest] = cur.split(/\n(?=## \[)/);
// La section « Non publié » (Keep a Changelog) reste en tête ; la nouvelle version s'insère juste après.
const unreleased = rest.length && /^## \[Non publié\]/.test(rest[0]) ? `${rest.shift().trimEnd()}\n\n` : '';
fs.writeFileSync(file, `${head.trimEnd()}\n\n${unreleased}${section}${rest.length ? rest.join('\n') : ''}`, 'utf8');
console.log(`CHANGELOG.md mis à jour pour ${version} (${lines.length} commit(s)).`);
