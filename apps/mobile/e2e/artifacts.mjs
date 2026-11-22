// Appariement des artefacts d'une campagne Maestro à leurs flux (ADR-3015 § 2).
//
// Un ancien lanceur indexait les captures par nom de fichier : Maestro nomme ses captures d'après
// l'étape (`takeScreenshot/<slug>.png`) et le transport dual-VM rendait un lot sans propriétaire,
// si bien que le premier flux retenu héritait de toutes les images, y compris celles des autres
// (d'où des ratios visuels identiques). Ici, un artefact n'est rattaché à un flux que par une
// preuve explicite :
//   1. le champ `flow` posé par l'agent appareil (nom ou nom de fichier du flux) ;
//   2. sinon le chemin de l'artefact, dont un segment de répertoire porte le nom du flux
//      (`<name du flux>/takeScreenshot/…`, la disposition de `--test-output-dir`) ;
//   3. sinon un nom de fichier qui désigne **un seul** flux — jamais de repli sur le premier flux.
// Un artefact ambigu ou inconnu est compté comme « non rattaché » et n'alimente aucune comparaison.

/** Clé stable d'un flux ou d'un fichier de flux : `SPEC-3003 session` → `spec-3003-session`. */
export function flowSlug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Nom de fichier sans extension : `SPEC-3003-session.yaml` → `SPEC-3003-session`. */
export function flowFileStem(file) {
  return String(file ?? '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.ya?ml$/i, '');
}

/** `true` quand le nom désigne une vidéo, `false` pour une capture d'écran. */
export function isVideoName(name) {
  return /\.(mp4|mov|webm|m4v)$/i.test(String(name ?? ''));
}

/** Index des flux d'une campagne : clés de nom et de fichier, plus l'entrée d'origine. */
function flowIndex(flows) {
  const byKey = new Map();
  for (const flow of flows) {
    const entry = { flow, keys: [] };
    // Un flux dont le nom et le fichier donnent la même clé ne doit pas se rendre ambigu.
    for (const key of new Set([flowSlug(flow.name), flowSlug(flowFileStem(flow.file))])) {
      if (key === '') continue;
      entry.keys.push(key);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(entry);
    }
  }
  return byKey;
}

/** Flux désigné par une clé, ou `null` si la clé n'existe pas ou désigne plusieurs flux. */
function flowOfKey(byKey, key) {
  const matches = byKey.get(key) ?? [];
  return matches.length === 1 ? (matches[0]?.flow ?? null) : null;
}

/**
 * Flux désigné par un chemin relatif d'artefact (`<flux>/takeScreenshot/x.png`). Le segment le plus
 * long gagne ; une égalité entre deux flux rend l'artefact ambigu.
 */
function flowOfPath(byKey, relativePath) {
  const segments = String(relativePath)
    .split('/')
    .slice(0, -1)
    .map((segment) => flowSlug(segment))
    .filter((segment) => segment !== '');
  let best = null;
  for (const segment of segments) {
    const flow = flowOfKey(byKey, segment);
    if (flow === null) continue;
    if (best === null || segment.length > best.length) best = { flow, length: segment.length };
  }
  return best?.flow ?? null;
}

/** Flux désigné par un nom de fichier, seulement quand ce nom ne désigne qu'un flux. */
function flowOfName(byKey, name) {
  const key = flowSlug(flowFileStem(name));
  if (key === '') return null;
  const exact = flowOfKey(byKey, key);
  if (exact !== null) return exact;
  // Nom plus long que le flux (`SPEC-3003-session-1.png`) : le flux reste identifiable si ses mots
  // forment une suite contiguë du nom, et s'il est le seul dans ce cas. Comparer des mots évite
  // qu'une clé courte (`a`) ne revendique `orphan.png`.
  const tokens = key.split('-').filter((token) => token !== '');
  const matched = [];
  for (const [candidate, entries] of byKey.entries()) {
    const wanted = candidate.split('-').filter((token) => token !== '');
    if (wanted.length === 0 || wanted.length > tokens.length) continue;
    for (let start = 0; start + wanted.length <= tokens.length; start += 1) {
      if (wanted.every((token, offset) => tokens[start + offset] === token)) {
        matched.push(...entries);
        break;
      }
    }
  }
  const unique = [...new Set(matched.map((entry) => entry.flow.name))];
  return unique.length === 1 ? (matched[0]?.flow ?? null) : null;
}

/**
 * Rattache chaque artefact à son flux.
 *
 * @param {{ artifacts?: object[], flows?: { name: string, file?: string }[] }} input
 * @returns {{
 *   byFlow: Record<string, { flow: object, screenshots: object[], videos: object[] }>,
 *   unattributed: { artifact: object, reason: 'sans-flux' | 'flux-inconnu' | 'ambigu' }[],
 * }}
 */
export function attributeArtifacts({ artifacts = [], flows = [] } = {}) {
  const byKey = flowIndex(flows);
  const byFlow = {};
  for (const flow of flows) {
    byFlow[flowSlug(flow.name)] = { flow, screenshots: [], videos: [] };
  }

  const unattributed = [];
  for (const artifact of artifacts) {
    const explicit = typeof artifact.flow === 'string' ? artifact.flow.trim() : '';
    let flow = null;
    if (explicit !== '') {
      flow = flowOfKey(byKey, flowSlug(explicit));
      if (flow === null) {
        unattributed.push({ artifact, reason: 'flux-inconnu' });
        continue;
      }
    } else {
      const relativePath = typeof artifact.path === 'string' ? artifact.path : '';
      if (relativePath.includes('/')) flow = flowOfPath(byKey, relativePath);
      if (flow === null && typeof artifact.name === 'string')
        flow = flowOfName(byKey, artifact.name);
      if (flow === null) {
        // Deux flux pourraient revendiquer ce nom : on ne choisit pas à leur place.
        unattributed.push({ artifact, reason: 'sans-flux' });
        continue;
      }
    }

    const bucket = byFlow[flowSlug(flow.name)];
    if (bucket === undefined) {
      unattributed.push({ artifact, reason: 'flux-inconnu' });
      continue;
    }
    if (isVideoName(artifact.name)) bucket.videos.push(artifact);
    else bucket.screenshots.push(artifact);
  }

  for (const bucket of Object.values(byFlow)) {
    bucket.screenshots.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    bucket.videos.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  return { byFlow, unattributed };
}

/** Captures d'un flux, dans l'ordre (vide quand aucune capture ne lui est rattachée). */
export function screenshotsForFlow(byFlow, flow) {
  return byFlow[flowSlug(flow.name)]?.screenshots ?? [];
}

/** Vidéos d'un flux, dans l'ordre. */
export function videosForFlow(byFlow, flow) {
  return byFlow[flowSlug(flow.name)]?.videos ?? [];
}
