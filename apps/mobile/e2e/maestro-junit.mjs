// Lecture du rapport JUnit produit par Maestro (SPEC-3001 EF-5, ADR-3015 § 3).
//
// Maestro écrit ce rapport une seule fois, à la fin de la campagne : l'agent appareil le relit tel
// quel et le renvoie sans le réécrire, et le lanceur ne fabrique aucun cas. Ce module se contente
// de le lire. Un rapport vide (Maestro interrompu, fichier tronqué, campagne sans flux) doit être
// signalé comme une panne d'outillage — jamais comme « zéro échec » : c'est le rôle de
// `junitProblem`.
//
// Maestro 2.12.1 pose trois informations utiles sur chaque `<testcase>` :
//   - `name`  : le `name:` du flux, qui est la clé d'appariement des flux (ADR-3015 § 3) ;
//   - `time`  : la durée du flux, en secondes ;
//   - `status`: `ERROR` / `FAILED` quand le flux échoue, même sans `<failure>` explicite.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Déséchappe les entités XML que Maestro écrit dans les attributs (messages d'assertion). */
export function decodeXmlText(value) {
  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity] ?? match;
  });
}

/** Lit un attribut d'une balise (`attr="valeur"` ou `attr='valeur'`). */
function attribute(source, name) {
  const quoted = new RegExp(`\\b${name}="([^"]*)"`).exec(source);
  if (quoted !== null) return decodeXmlText(quoted[1] ?? '');
  const single = new RegExp(`\\b${name}='([^']*)'`).exec(source);
  return single === null ? null : decodeXmlText(single[1] ?? '');
}

/**
 * Extrait les cas de test d'un rapport JUnit Maestro.
 * Retourne `[{ name, file, time, status, message }]` dans l'ordre du fichier.
 */
export function parseJunit(xml) {
  const cases = [];
  if (typeof xml !== 'string' || xml.trim() === '') return cases;

  for (const block of xml.split(/<testcase\b/).slice(1)) {
    const head = block.split(/>/)[0] ?? '';
    const body = block.split('</testcase>')[0] ?? block;
    const rawStatus = (attribute(head, 'status') ?? '').toUpperCase();
    const failed =
      /<failure\b/.test(body) ||
      /<error\b/.test(body) ||
      rawStatus === 'ERROR' ||
      rawStatus === 'FAILED';
    const skipped = /<skipped\b/.test(body) || rawStatus === 'SKIPPED';
    const duration = Number(attribute(head, 'time') ?? '0');
    cases.push({
      name: attribute(head, 'name') ?? '',
      file: attribute(head, 'file') ?? null,
      time: Number.isFinite(duration) ? duration : 0,
      status: failed ? 'failed' : skipped ? 'skipped' : 'passed',
      message: attribute(body, 'message'),
    });
  }
  return cases;
}

/** Noms des cas du rapport, dans l'ordre, sans les vides. */
export function testcaseNames(xml) {
  return parseJunit(xml)
    .map((entry) => entry.name)
    .filter((name) => name !== '');
}

/**
 * Flux sans cas de test correspondant : la comparaison se fait sur le `name:` exact du flux
 * (jamais sur son nom de fichier, ADR-3015 § 3).
 */
export function missingFlows(xml, flows) {
  const names = new Set(testcaseNames(xml));
  return flows.filter((flow) => !names.has(flow.name)).map((flow) => flow.name);
}

/**
 * Diagnostic d'un rapport JUnit : `null` quand il porte au moins un cas nommé, sinon la raison
 * exacte. Le lanceur échoue explicitement sur un rapport vide (ADR-3015 § 3).
 */
export function junitProblem(xml) {
  if (typeof xml !== 'string' || xml.trim() === '') return 'rapport JUnit absent ou vide';
  const cases = parseJunit(xml);
  if (cases.length === 0) return 'rapport JUnit sans <testcase> (campagne interrompue ?)';
  if (!cases.some((entry) => entry.name !== '')) return 'rapport JUnit sans cas nommé';
  return null;
}
