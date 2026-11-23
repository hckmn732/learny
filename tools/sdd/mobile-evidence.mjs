#!/usr/bin/env node
// Contrôle des preuves e2e mobiles d'une phase (ADR-3016).
//
// Le checkpoint d'une phase de la piste `mobile` ne rejoue pas `pnpm test:e2e` (suite web Playwright,
// piste `produit`) ni une campagne Maestro globale : le lanceur mobile exige une étiquette
// `SPEC-xxxx`, et chaque spécification a déjà produit sa campagne (vidéo, captures, comparaison
// visuelle). Le checkpoint agrège donc ces preuves et refuse toute spécification sans campagne
// réussie.
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './lib.mjs';

/**
 * Vérifie les preuves d'une spécification mobile.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function checkSpecEvidence(specId) {
  const dir = path.join(ROOT, 'evidence', specId);
  const report = path.join(dir, 'e2e-mobile.json');
  const reasons = [];
  if (!fs.existsSync(report)) {
    return { ok: false, reasons: [`${specId} : e2e-mobile.json absent`] };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(report, 'utf8'));
  } catch {
    return { ok: false, reasons: [`${specId} : e2e-mobile.json illisible`] };
  }
  if ((data.passed ?? 0) < 1) reasons.push(`${specId} : aucun flux Maestro réussi`);
  if ((data.failed ?? 0) > 0) reasons.push(`${specId} : ${String(data.failed)} flux Maestro en échec`);
  // ADR-3019 : une spécification peut déclarer la comparaison pixel non applicable (export de
  // référence sans chrome système). Elle n'a alors aucun flux `@visual` : on exige seulement
  // l'absence d'échec, et l'exemption est documentée dans son `acceptance.md`.
  const visualFlows = (data.flows ?? []).filter((flow) => (flow.tags ?? []).includes('visual')).length;
  if (visualFlows === 0) {
    if ((data.failed ?? 0) > 0) reasons.push(`${specId} : campagne en échec sans flux @visual`);
  } else if ((data.visual ?? 0) < 1) {
    reasons.push(`${specId} : aucune comparaison visuelle`);
  }
  const captures = (data.flows ?? []).flatMap((flow) => flow.screenshots ?? []);
  if (captures.length === 0) reasons.push(`${specId} : aucune capture`);
  if (!fs.existsSync(path.join(dir, 'acceptance.md'))) {
    reasons.push(`${specId} : acceptance.md absent`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Vérifie les preuves de toutes les spécifications d'une phase. */
export function checkPhaseEvidence(specIds) {
  const results = specIds.map((id) => ({ id, ...checkSpecEvidence(id) }));
  const ok = results.every((r) => r.ok);
  for (const r of results) {
    const label = r.ok ? '✔' : '✖';
    console.log(`${label} ${r.id}${r.ok ? '' : ` — ${r.reasons.join(' ; ')}`}`);
  }
  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('usage : node tools/sdd/mobile-evidence.mjs SPEC-xxxx [SPEC-yyyy…]');
    process.exitCode = 2;
  } else {
    process.exitCode = checkPhaseEvidence(ids) ? 0 : 1;
  }
}
