// Fonctions pures de la boucle SDD (aucun accès disque, aucune horloge) : statuts, prochaine action, rendu.
// Partagées par les commandes tools/sdd/*.mjs et par le tableau de bord de l'application (SPEC-003).

export const MAX_ATTEMPTS = 5;
export const STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
export const DISPLAY_STATUSES = ['pending', 'ready', 'waiting', 'in_progress', 'done', 'blocked', 'dependency_blocked'];

/** Ajoute l'index byId au catalogue brut. */
export function indexCatalog(raw) {
  return { ...raw, byId: Object.fromEntries(raw.specs.map((s) => [s.id, s])) };
}

export function emptySpecState() {
  return {
    status: 'pending',
    attempts: 0,
    startedAt: null,
    completedAt: null,
    branch: null,
    commit: null,
    lastError: null,
    validations: {},
  };
}

/** Complète un état lu (ou absent) avec les entrées manquantes du catalogue, sans rien réinitialiser. */
export function normalizeState(catalog, raw) {
  const st = raw ?? { version: 1, updatedAt: null, specs: {}, checkpoints: {}, anomalies: [] };
  st.specs ??= {};
  st.checkpoints ??= {};
  for (const s of catalog.specs) if (!st.specs[s.id]) st.specs[s.id] = emptySpecState();
  for (const ph of catalog.phases) if (!st.checkpoints[ph.checkpoint]) st.checkpoints[ph.checkpoint] = { status: 'pending', at: null, tag: null, report: null };
  st.anomalies ??= [];
  return st;
}

/** Statut affiché : pending devient waiting (dépendances non terminées) ou dependency_blocked. */
export function displayStatus(catalog, st, id) {
  const s = st.specs[id];
  if (s.status !== 'pending') return s.status;
  const deps = catalog.byId[id].dependsOn;
  if (deps.some((d) => isBlockedTransitively(catalog, st, d))) return 'dependency_blocked';
  if (deps.every((d) => st.specs[d]?.status === 'done') && phaseUnlocked(catalog, st, catalog.byId[id].phase)) return 'ready';
  return 'waiting';
}

export function isBlockedTransitively(catalog, st, id, seen = new Set()) {
  if (seen.has(id)) return false;
  seen.add(id);
  if (!st.specs[id] || !catalog.byId[id]) return false;
  if (st.specs[id].status === 'blocked') return true;
  return catalog.byId[id].dependsOn.some((d) => isBlockedTransitively(catalog, st, d, seen));
}

// Pistes (ADR-1006) : une phase appartient à une piste (`track`, « produit » par défaut). Chaque piste
// est une suite ordonnée de phases indépendante des autres ; `requires` ajoute des checkpoints d'autres
// pistes à attendre. La piste active (`catalog.activeTrack`, surchargée par SDD_TRACK) pilote next.mjs.
export const DEFAULT_TRACK = 'produit';

export function trackOf(phase) {
  return phase?.track ?? DEFAULT_TRACK;
}

/** Piste active : surcharge explicite, sinon `catalog.activeTrack`, sinon « produit ». */
export function activeTrack(catalog, override) {
  return override || catalog.activeTrack || DEFAULT_TRACK;
}

/** Configuration d'une piste : branche de base (fusions, push), tags de version SemVer et plage d'ADR. */
export function trackConfig(catalog, track) {
  return { baseBranch: 'main', versionTags: true, adrBase: 0, ...(catalog.tracks?.[track] ?? {}) };
}

/**
 * Numéro du prochain ADR d'une piste : chaque piste numérote dans sa propre plage de mille
 * (`adrBase` 0 → ADR-0001…0999, 1000 → ADR-1001…1999) pour que deux branches parallèles
 * ne créent jamais le même identifiant (ADR-1006).
 */
export function nextAdrNumber(existing, adrBase = 0) {
  const inRange = existing.filter((n) => n > adrBase && n < adrBase + 1000);
  const n = Math.max(adrBase, ...inRange) + 1;
  if (n >= adrBase + 1000) throw new Error(`Plage d'ADR épuisée (${adrBase + 1}–${adrBase + 999}).`);
  return n;
}

export function phaseOf(catalog, phaseId) {
  return catalog.phases.find((p) => p.id === phaseId);
}

/** Piste d'une spécification (celle de sa phase). */
export function specTrack(catalog, spec) {
  return trackOf(phaseOf(catalog, spec.phase));
}

/**
 * Une phase est débloquée quand le checkpoint de la phase précédente **de la même piste** est réussi
 * et que tous les checkpoints de `requires` sont réussis.
 */
export function phaseUnlocked(catalog, st, phaseId) {
  const phase = phaseOf(catalog, phaseId);
  if (!phase) return false;
  if (!(phase.requires ?? []).every((cp) => st.checkpoints[cp]?.status === 'passed')) return false;
  const same = catalog.phases.filter((p) => trackOf(p) === trackOf(phase));
  const idx = same.indexOf(phase);
  if (idx <= 0) return true;
  return st.checkpoints[same[idx - 1].checkpoint]?.status === 'passed';
}

/** Spécifications prêtes, éventuellement limitées à une piste. */
export function readySpecs(catalog, st, track) {
  return catalog.specs.filter(
    (s) => displayStatus(catalog, st, s.id) === 'ready' && (track === undefined || specTrack(catalog, s) === track),
  );
}

/**
 * Fusion de deux états de suivi par piste (ADR-1006 §4) : les entrées des spécifications et
 * checkpoints de `track` viennent de `ours` (branche courante), toutes les autres de `theirs`
 * (branche de base) — entrée entière, jamais un mélange champ par champ (CL-5). Une entrée
 * absente du côté propriétaire retombe sur l'autre côté ; `updatedAt` garde le plus récent.
 * Pure : aucun accès disque, aucune horloge, les arguments ne sont jamais modifiés.
 */
export function mergeTrackStates(catalog, ours, theirs, track) {
  const oursSpecs = ours.specs ?? {};
  const theirsSpecs = theirs.specs ?? {};
  const oursCheckpoints = ours.checkpoints ?? {};
  const theirsCheckpoints = theirs.checkpoints ?? {};
  const cpTracks = new Map(catalog.phases.map((ph) => [ph.checkpoint, trackOf(ph)]));

  const choose = (own, other, fromOurs) => (fromOurs ? own ?? other : other ?? own);

  const specs = {};
  for (const id of new Set([...Object.keys(oursSpecs), ...Object.keys(theirsSpecs)])) {
    const fromOurs = catalog.byId[id] !== undefined && specTrack(catalog, catalog.byId[id]) === track;
    specs[id] = choose(oursSpecs[id], theirsSpecs[id], fromOurs);
  }

  const checkpoints = {};
  for (const id of new Set([...Object.keys(oursCheckpoints), ...Object.keys(theirsCheckpoints)])) {
    checkpoints[id] = choose(oursCheckpoints[id], theirsCheckpoints[id], cpTracks.get(id) === track);
  }

  const anomalies = [];
  const seen = new Set();
  for (const entry of [...(ours.anomalies ?? []), ...(theirs.anomalies ?? [])]) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue; // doublon hérité du point de départ de la piste
    seen.add(key);
    anomalies.push(entry);
  }

  // Le plus récent : chaque commande SDD réécrit updatedAt, la ligne conflit à chaque sync (EF-3).
  const updatedAt = [ours.updatedAt, theirs.updatedAt].filter(Boolean).sort().at(-1) ?? null;
  return { version: ours.version ?? theirs.version ?? 1, updatedAt, specs, checkpoints, anomalies };
}

/**
 * Prochaine action de la piste active : reprendre une spécification en cours, sinon checkpoint dû,
 * sinon première spécification prête.
 */
export function nextAction(catalog, st, track = activeTrack(catalog)) {
  const phases = catalog.phases.filter((p) => trackOf(p) === track);
  const ids = new Set(phases.map((p) => p.id));
  const specsOfTrack = catalog.specs.filter((s) => ids.has(s.phase));
  const inProgress = specsOfTrack.find((s) => st.specs[s.id].status === 'in_progress');
  if (inProgress) return { kind: 'resume', spec: inProgress };
  for (const ph of phases) {
    const specs = specsOfTrack.filter((s) => s.phase === ph.id);
    const cp = st.checkpoints[ph.checkpoint];
    if (cp.status === 'passed') continue;
    const allDone = specs.every((s) => st.specs[s.id].status === 'done');
    if (allDone && phaseUnlocked(catalog, st, ph.id)) return { kind: 'checkpoint', checkpoint: ph.checkpoint, phase: ph };
    break;
  }
  const ready = readySpecs(catalog, st, track);
  if (ready.length) return { kind: 'start', spec: ready[0] };
  const pending = specsOfTrack.filter((s) => st.specs[s.id].status !== 'done');
  const allCheckpointsPassed = phases.every((ph) => st.checkpoints[ph.checkpoint]?.status === 'passed');
  if (pending.length === 0 && allCheckpointsPassed) return { kind: 'finished' };
  const waitingFor = [
    ...new Set(phases.flatMap((p) => (p.requires ?? []).filter((cp) => st.checkpoints[cp]?.status !== 'passed'))),
  ];
  return {
    kind: 'stuck',
    remaining: pending.map((s) => `${s.id}:${displayStatus(catalog, st, s.id)}`),
    ...(waitingFor.length ? { waitingFor } : {}),
  };
}

/** Sortie machine de next.mjs --json. */
export function nextActionJson(action) {
  const out = { kind: action.kind };
  if (action.spec) Object.assign(out, { id: action.spec.id, title: action.spec.title, path: action.spec.path, dependsOn: action.spec.dependsOn });
  if (action.checkpoint) Object.assign(out, { checkpoint: action.checkpoint, phase: action.phase.id });
  if (action.remaining) out.remaining = action.remaining;
  if (action.waitingFor) out.waitingFor = action.waitingFor;
  return out;
}

/** Indicateurs agrégés du tableau de bord. */
export function progressSummary(catalog, st) {
  const all = catalog.specs;
  const ds = Object.fromEntries(all.map((s) => [s.id, displayStatus(catalog, st, s.id)]));
  const count = (k) => all.filter((s) => ds[s.id] === k).length;
  const v1 = all.filter((s) => s.priority === 'V1');
  const v1done = v1.filter((s) => ds[s.id] === 'done').length;
  const done = count('done');
  const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
  return {
    displayStatuses: ds,
    total: all.length,
    v1Total: v1.length,
    done,
    inProgress: count('in_progress'),
    ready: count('ready'),
    waiting: count('waiting'),
    blocked: count('blocked'),
    dependencyBlocked: count('dependency_blocked'),
    globalPercent: pct(done, all.length),
    v1Percent: pct(v1done, v1.length),
    phases: catalog.phases.map((ph) => {
      const sp = all.filter((s) => s.phase === ph.id);
      return { ...ph, total: sp.length, done: sp.filter((s) => ds[s.id] === 'done').length, checkpointState: st.checkpoints[ph.checkpoint] };
    }),
  };
}

const ICON = { done: '✅', in_progress: '🔄', ready: '🟢', waiting: '⏳', blocked: '⛔', dependency_blocked: '🚫' };

/** Contenu de progress/PROGRESS.md ; `now` est l'horodatage explicite (seule partie variable). */
export function renderProgressMarkdown(catalog, st, now) {
  const all = catalog.specs;
  const sum = progressSummary(catalog, st);
  const ds = sum.displayStatuses;
  const next = nextAction(catalog, st);
  const nextTxt = next.spec ? `${next.kind} ${next.spec.id} — ${next.spec.title}` : next.checkpoint ? `checkpoint ${next.checkpoint}` : next.kind;

  let md = `# Progression du projet Learny\n\n> Généré par \`node tools/sdd/status.mjs\` le ${now}. Ne pas éditer à la main.\n\n`;
  md += `## Synthèse\n\n| Indicateur | Valeur |\n|---|---|\n`;
  const others = all.filter((s) => s.priority !== 'V1' && s.priority !== 'V2').length;
  md += `| Spécifications | ${all.length} (V1 : ${sum.v1Total}, V2 : ${all.length - sum.v1Total - others}${others ? `, migration : ${others}` : ''}) |\n`;
  md += `| Terminées | ${sum.done} |\n| En cours | ${sum.inProgress} |\n| Prêtes | ${sum.ready} |\n| En attente de dépendances | ${sum.waiting} |\n| Bloquées | ${sum.blocked} |\n| Bloquées par une dépendance | ${sum.dependencyBlocked} |\n`;
  md += `| **Avancement global** | **${sum.globalPercent.toFixed(1)} %** |\n| Avancement V1 | ${sum.v1Percent.toFixed(1)} % |\n| Piste active | ${activeTrack(catalog)} |\n| Prochaine action | ${nextTxt} |\n\n`;

  md += `## Phases et checkpoints\n\n| Phase | Titre | Terminées | Checkpoint | Statut |\n|---|---|---|---|---|\n`;
  for (const ph of sum.phases) {
    const cp = ph.checkpointState;
    md += `| ${ph.id} | ${ph.title} | ${ph.done}/${ph.total} | ${ph.checkpoint} | ${cp.status === 'passed' ? `✅ ${cp.at?.slice(0, 10) ?? ''} ${cp.tag ?? ''}` : cp.status === 'failed' ? '❌ échec' : '⏳'} |\n`;
  }

  md += `\n## Détail des spécifications\n\n| Spécification | Titre | Phase | Statut | Tentatives | Validations | Dépendances |\n|---|---|---|---|---|---|---|\n`;
  for (const s of all) {
    const x = st.specs[s.id];
    const v = Object.entries(x.validations ?? {}).map(([k, r]) => `${r.status === 'passed' ? '✓' : '✗'}${k}`).join(' ');
    md += `| [${s.id}](../${s.path}) | ${s.title} | ${s.phase} | ${ICON[ds[s.id]] ?? ''} ${ds[s.id]} | ${x.attempts} | ${v || '—'} | ${s.dependsOn.join(', ') || '—'} |\n`;
  }

  const blocked = all.filter((s) => ['blocked', 'dependency_blocked'].includes(ds[s.id]));
  md += `\n## Anomalies et blocages\n\n`;
  md += blocked.length ? blocked.map((s) => `- ${s.id} (${ds[s.id]}) : ${st.specs[s.id].lastError ?? 'dépendance bloquée'}`).join('\n') + '\n' : 'Aucun.\n';
  md += `\nDétails : [anomalies.md](anomalies.md), [blockers.md](blockers.md).\n`;
  return md;
}

/** Résultats Playwright des tests étiquetés @tag : réussis, échoués, vidéos, tests @visual réussis. */
export function summarizePlaywright(report, tag) {
  const out = { passed: 0, failed: 0, videos: 0, visual: 0 };
  const walk = (suite) => {
    for (const sp of suite.specs ?? []) {
      // `@SPEC-110` ne doit pas retenir `@SPEC-1101` (identifiants à 4 chiffres, ADR-1006).
      const own = new RegExp(`@${tag}(?![0-9])`);
      if (!own.test(sp.title) && !(sp.tags ?? []).includes(`@${tag}`)) continue;
      const isVisual = sp.title.includes('@visual') || (sp.tags ?? []).includes('@visual');
      for (const t of sp.tests ?? []) for (const r of t.results ?? []) {
        if (r.status === 'passed') { out.passed += 1; if (isVisual) out.visual += 1; }
        else if (r.status !== 'skipped') out.failed += 1;
        out.videos += (r.attachments ?? []).filter((a) => a.name === 'video').length;
      }
    }
    for (const sub of suite.suites ?? []) walk(sub);
  };
  for (const su of report?.suites ?? []) walk(su);
  return out;
}

/** Étape e2e réussie : code 0, aucun échec, au moins un test réussi et au moins une vidéo (CL-6). */
export function e2eVerdict(code, summary) {
  return code === 0 && summary.failed === 0 && summary.passed > 0 && summary.videos > 0;
}

/** Étape visuelle réussie : au moins un test @visual réussi, aucun échec. */
export function visualVerdict(summary) {
  return summary.visual > 0 && summary.failed === 0;
}

// ---------------------------------------------------------------------------------------------
// Piste mobile (SPEC-3001 EF-4, EF-5) : campagnes Maestro et sélection des commandes de validation.

/** Commandes de validation d'une piste : la piste mobile ajoute Jest et remplace e2e par Maestro. */
export function validationPlan(track) {
  const mobile = track === 'mobile';
  return {
    track,
    jest: mobile ? 'test:mobile' : null,
    e2e: mobile ? 'test:e2e:mobile' : 'test:e2e',
    visual: mobile ? 'test:e2e:mobile' : 'test:e2e',
    e2eReport: mobile ? 'e2e-mobile.json' : 'e2e.json',
  };
}

/** Compte les tests `[SPEC-xxx]` d'un rapport JSON Jest (`--json`). */
export function summarizeJest(report, tag) {
  const out = { passed: 0, failed: 0 };
  const needle = `[${tag}]`;
  for (const file of report?.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const full = [...(assertion.ancestorTitles ?? []), assertion.title].join(' ');
      if (!full.includes(needle)) continue;
      if (assertion.status === 'passed') out.passed += 1;
      else if (assertion.status === 'failed') out.failed += 1;
    }
  }
  return out;
}

/**
 * Compte les flux d'une campagne Maestro (rapport `e2e-mobile.json` écrit par run-maestro.mjs).
 * L'étiquette est comparée exactement : l'étiquette `SPEC-110` ne retient pas `SPEC-1101`.
 */
export function summarizeMaestro(report, tag) {
  const out = { passed: 0, failed: 0, videos: 0, visual: 0, flows: [] };
  for (const flow of report?.flows ?? []) {
    const tags = Array.isArray(flow?.tags) ? flow.tags.map(String) : [];
    if (!tags.includes(tag)) continue;
    const status = flow.status === 'passed' ? 'passed' : 'failed';
    if (status === 'passed') out.passed += 1;
    else out.failed += 1;
    const videos = Array.isArray(flow.videos) ? flow.videos.length : 0;
    out.videos += videos;
    const isVisual = tags.includes('visual');
    if (isVisual && flow.visual?.status === 'passed') out.visual += 1;
    out.flows.push({ name: String(flow.name ?? ''), status, videos, visual: isVisual });
  }
  return out;
}

/** Étape e2e mobile réussie : code 0, aucun flux en échec, au moins un flux et une vidéo (CL-4). */
export function maestroVerdict(code, summary) {
  return code === 0 && summary.failed === 0 && summary.passed > 0 && summary.videos > 0;
}

/** Étape visuelle mobile réussie : au moins un flux `visual` réussi, aucun flux en échec. */
export function mobileVisualVerdict(summary) {
  return summary.visual > 0 && summary.failed === 0;
}
