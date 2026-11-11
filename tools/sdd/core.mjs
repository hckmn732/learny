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

/** Une phase est débloquée quand le checkpoint de la phase précédente est réussi. */
export function phaseUnlocked(catalog, st, phaseId) {
  const idx = catalog.phases.findIndex((p) => p.id === phaseId);
  if (idx <= 0) return true;
  const prev = catalog.phases[idx - 1];
  return st.checkpoints[prev.checkpoint]?.status === 'passed';
}

export function readySpecs(catalog, st) {
  return catalog.specs.filter((s) => displayStatus(catalog, st, s.id) === 'ready');
}

/** Prochaine action : reprendre une spécification en cours, sinon checkpoint dû, sinon première spécification prête. */
export function nextAction(catalog, st) {
  const inProgress = catalog.specs.find((s) => st.specs[s.id].status === 'in_progress');
  if (inProgress) return { kind: 'resume', spec: inProgress };
  for (const ph of catalog.phases) {
    const specs = catalog.specs.filter((s) => s.phase === ph.id);
    const cp = st.checkpoints[ph.checkpoint];
    if (cp.status === 'passed') continue;
    const allDone = specs.every((s) => st.specs[s.id].status === 'done');
    if (allDone && phaseUnlocked(catalog, st, ph.id)) return { kind: 'checkpoint', checkpoint: ph.checkpoint, phase: ph };
    break;
  }
  const ready = readySpecs(catalog, st);
  if (ready.length) return { kind: 'start', spec: ready[0] };
  const pending = catalog.specs.filter((s) => st.specs[s.id].status !== 'done');
  const allCheckpointsPassed = catalog.phases.every((ph) => st.checkpoints[ph.checkpoint]?.status === 'passed');
  if (pending.length === 0 && allCheckpointsPassed) return { kind: 'finished' };
  return { kind: 'stuck', remaining: pending.map((s) => `${s.id}:${displayStatus(catalog, st, s.id)}`) };
}

/** Sortie machine de next.mjs --json. */
export function nextActionJson(action) {
  const out = { kind: action.kind };
  if (action.spec) Object.assign(out, { id: action.spec.id, title: action.spec.title, path: action.spec.path, dependsOn: action.spec.dependsOn });
  if (action.checkpoint) Object.assign(out, { checkpoint: action.checkpoint, phase: action.phase.id });
  if (action.remaining) out.remaining = action.remaining;
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
  md += `| Spécifications | ${all.length} (V1 : ${sum.v1Total}, V2 : ${all.length - sum.v1Total}) |\n`;
  md += `| Terminées | ${sum.done} |\n| En cours | ${sum.inProgress} |\n| Prêtes | ${sum.ready} |\n| En attente de dépendances | ${sum.waiting} |\n| Bloquées | ${sum.blocked} |\n| Bloquées par une dépendance | ${sum.dependencyBlocked} |\n`;
  md += `| **Avancement global** | **${sum.globalPercent.toFixed(1)} %** |\n| Avancement V1 | ${sum.v1Percent.toFixed(1)} % |\n| Prochaine action | ${nextTxt} |\n\n`;

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
      if (!sp.title.includes(`@${tag}`) && !(sp.tags ?? []).includes(`@${tag}`)) continue;
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
