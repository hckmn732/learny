// Fonctions pures du manifeste des références visuelles (SPEC-005, EF-3, EF-4, CL-3).
import crypto from 'node:crypto';

export const FIXED_AT = '2026-11-11T12:20:00Z';
export const LOCALE = 'fr-FR';
export const TIME_ZONE = 'Europe/Paris';
/** Échelle des maquettes (support.js, BR-NAV-06, ADR-0034). */
export const ZOOM = 0.9;
export const SOURCES_DIR = 'design/maquettes';
export const REFERENCES_DIR = 'design/references';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCREEN = /^SCR-\d{2}$/;

export function referenceFile(screenId, state, viewport) {
  return `${screenId}-${state}-${viewport}.png`;
}

/** Fichier source (sans requête ni ancre) d'un scénario. */
export function sourceFile(source) {
  return source.replace(/[?#].*$/, '');
}

/** Contrôle la table avant tout lancement de navigateur ; renvoie la liste des erreurs. */
export function validateScenarios(scenarios, viewports) {
  const errors = [];
  const seen = new Map();
  for (const s of scenarios) {
    const id = `${s.screenId ?? '?'}/${s.state ?? '?'}`;
    if (!SCREEN.test(s.screenId ?? '')) errors.push(`${id} : screenId invalide`);
    if (!SLUG.test(s.state ?? '')) errors.push(`${id} : nom d'état invalide`);
    if (!s.source || !sourceFile(s.source).endsWith('.dc.html')) errors.push(`${id} : source invalide`);
    if (typeof s.setup !== 'function' || typeof s.expect !== 'function') errors.push(`${id} : setup et expect sont obligatoires`);
    for (const vp of Object.keys(viewports)) {
      const file = referenceFile(s.screenId, s.state, vp);
      if (seen.has(file)) errors.push(`Nom de fichier en double : ${file} (${seen.get(file)} et ${id})`);
      else seen.set(file, id);
    }
  }
  return errors;
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Largeur et hauteur lues dans l'en-tête IHDR d'un PNG. */
export function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) throw new Error('PNG invalide');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function manifestEntry({ screenId, state, viewport, source, png, viewportSize, zoom = ZOOM }) {
  if (zoom !== ZOOM) throw new Error(`Zoom ${zoom} refusé : les maquettes sont rendues à ${ZOOM} (BR-NAV-06)`);
  const { width, height } = pngSize(png);
  return {
    screenId,
    state,
    viewport,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    source: `${SOURCES_DIR}/${source}`,
    file: `${REFERENCES_DIR}/${referenceFile(screenId, state, viewport)}`,
    width,
    height,
    fixedAt: FIXED_AT,
    locale: LOCALE,
    timeZone: TIME_ZONE,
    zoom,
    sha256: sha256(png),
  };
}

export function sortEntries(entries) {
  const key = (e) => [e.screenId, e.state, e.viewport];
  return [...entries].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
}

export function buildManifest(entries) {
  return { version: 1, generatedFor: FIXED_AT, rule: 'BR-NAV-06', zoom: ZOOM, references: sortEntries(entries) };
}

/** Propriétés relevées sur les éléments clés (EF-5). */
export const TOKEN_PROPERTIES = [
  'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height',
  'border-radius', 'border-color', 'padding', 'gap',
];
export const TOKEN_SELECTORS = [
  'body', 'h1', 'h2', 'h3', 'a', 'button', '[role="tab"]', '[data-sidebar]', 'nav a', 'main', 'section', 'input', 'select',
];

/** Entrées de jetons triées et dédoublonnées, avec provenance. */
export function tokenEntries(raw) {
  const out = new Map();
  for (const r of raw) {
    if (r.value === '' || r.value === 'normal' || r.value === 'none' || r.value === '0px') continue;
    const k = `${r.screenId}|${r.selector}|${r.property}`;
    if (!out.has(k)) out.set(k, { screenId: r.screenId, source: r.source, selector: r.selector, property: r.property, value: r.value });
  }
  return [...out.values()].sort((a, b) => (`${a.property}|${a.screenId}|${a.selector}` < `${b.property}|${b.screenId}|${b.selector}` ? -1 : 1));
}

export function buildTokens(entries) {
  const values = {};
  for (const e of entries) (values[e.property] ??= new Set()).add(e.value);
  return {
    version: 1,
    rule: 'BR-NAV-06',
    zoom: ZOOM,
    note: 'Valeurs CSS calculées avant le zoom de 90 % appliqué par support.js (html { zoom: 0.9 }).',
    distinct: Object.fromEntries(Object.entries(values).sort().map(([k, v]) => [k, [...v].sort()])),
    entries,
  };
}

export function toJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}
