#!/usr/bin/env node
// Bascule progressive d'un contexte par surcharge de propriété (SPEC-2301, ADR-2005).
//
// Le tableau `api/ownership.yaml` est l'état cible ; `OWNERSHIP_OVERRIDES` est l'état temporaire
// déployé sur la façade. Ce script produit cet état, jamais à la main :
//
//   - `--stage reads`  : canary en lecture — les GET du contexte passent à `py`, toutes ses
//                        mutations restent à `ts` ;
//   - `--stage writes` : promotion — les mutations passent à `py` d'un seul bloc, en refusant si
//                        une lecture n'est pas encore `py` (canary non fait) ;
//   - `--stage rollback` : tout le contexte revient à `ts`.
//
// Invariant (ADR-2005) : une mutation n'est jamais servie des deux côtés. Un contexte dont les
// mutations sont réparties entre `ts` et `py` est refusé, à la production comme à la lecture d'une
// surcharge existante (`--check`). La valeur `py@<pourcentage>` du plan P23 n'est pas acceptée :
// la façade ne lit que `ts` et `py` (learny.shared.ownership.overrides_from_env), et une valeur
// silencieusement ignorée ferait croire à une bascule qui n'a pas lieu.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OWNERSHIP_FILE = 'api/ownership.yaml';
export const INVENTORY_FILE = 'api/inventory.json';
export const WILDCARD = '*';
export const STAGES = ['reads', 'writes', 'rollback'];
export const READ_METHODS = new Set(['GET', 'HEAD']);

export class CutoverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CutoverError';
    this.code = code;
  }
}

/** Lit le tableau de propriété versionné (opérations et routes spéciales). */
export function parseOwnership(text) {
  const raw = YAML.parse(text) ?? {};
  const section = (name) => {
    const table = raw[name] ?? {};
    if (typeof table !== 'object' || Array.isArray(table)) {
      throw new CutoverError('INVALID_TABLE', `${name} doit être une table`);
    }
    for (const [entry, owner] of Object.entries(table)) {
      if (owner !== 'ts' && owner !== 'py') {
        throw new CutoverError('INVALID_OWNER', `${name}.${entry} : propriétaire ${String(owner)}`);
      }
    }
    return table;
  };
  return { operations: section('operations'), special: section('special') };
}

/** Opérations de l'inventaire avec leur méthode et leur contexte (`api/inventory.json`). */
export function readInventory(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.operations)) {
    throw new CutoverError('INVALID_INVENTORY', 'operations absentes de l’inventaire');
  }
  return data.operations.map((operation) => ({
    id: String(operation.id),
    method: String(operation.method ?? 'GET').toUpperCase(),
    context: String(operation.context ?? 'unknown'),
  }));
}

export function isRead(operation) {
  return READ_METHODS.has(operation.method);
}

/** Charge les deux artefacts du dépôt ; les tests passent des racines temporaires. */
export function readTables(root = ROOT) {
  const ownership = parseOwnership(fs.readFileSync(path.join(root, OWNERSHIP_FILE), 'utf8'));
  const inventory = readInventory(fs.readFileSync(path.join(root, INVENTORY_FILE), 'utf8'));
  return { ownership, inventory };
}

/** Une surcharge est un objet JSON `{entrée|"*": "ts"|"py"}` ; rien d'autre n'est accepté. */
export function normaliseOverrides(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CutoverError('INVALID_OVERRIDES', 'OWNERSHIP_OVERRIDES doit être un objet JSON');
  }
  const overrides = {};
  for (const [entry, owner] of Object.entries(parsed)) {
    if (owner !== 'ts' && owner !== 'py') {
      throw new CutoverError(
        'INVALID_OWNER',
        `${entry} : « ${String(owner)} » refusé ; la façade n’accepte que ts et py`,
      );
    }
    overrides[entry] = owner;
  }
  return overrides;
}

/** Propriétaire effectif d'une entrée : l'entrée explicite, puis le joker, puis le tableau. */
export function ownerOf(entry, table, overrides) {
  if (overrides[entry] !== undefined) return overrides[entry];
  if (overrides[WILDCARD] !== undefined) return overrides[WILDCARD];
  return table[entry];
}

/** Expansion complète de la surcharge, dans l'ordre trié, pour l'affichage et la comparaison. */
export function expand({ ownership, inventory }, overrides) {
  const entries = [
    ...inventory.map((operation) => operation.id),
    ...Object.keys(ownership.special),
  ];
  return Object.fromEntries(
    entries.map((entry) => [entry, ownerOf(entry, ownership.operations, overrides)]),
  );
}

/** Contextes connus de l'inventaire, avec le compte de lectures et de mutations. */
export function contextsOf(inventory) {
  const contexts = new Map();
  for (const operation of inventory) {
    const current = contexts.get(operation.context) ?? { reads: [], writes: [] };
    (isRead(operation) ? current.reads : current.writes).push(operation.id);
    contexts.set(operation.context, current);
  }
  return contexts;
}

function requireContext(inventory, context) {
  const contexts = contextsOf(inventory);
  const found = contexts.get(context);
  if (found === undefined) {
    throw new CutoverError('UNKNOWN_CONTEXT', `contexte inconnu : ${context}`);
  }
  if (found.writes.length === 0) {
    throw new CutoverError('NO_WRITES', `le contexte ${context} n’a aucune mutation`);
  }
  return found;
}

/** Refuse une surcharge où les mutations d'un contexte sont servies des deux côtés. */
export function writersOf({ ownership, inventory }, overrides, context) {
  const operations = inventory.filter((operation) => operation.context === context);
  const writes = operations.filter((operation) => !isRead(operation));
  const owners = new Set(
    writes.map((operation) => ownerOf(operation.id, ownership.operations, overrides)),
  );
  return { owners: [...owners].sort(), writes: writes.map((operation) => operation.id) };
}

/** Vérifie la forme d'une surcharge : entrées connues, valeurs acceptées par la façade. */
export function checkOverrides(tables, overrides) {
  const issues = [];
  const { ownership, inventory } = tables;
  const known = new Set([
    WILDCARD,
    ...inventory.map((operation) => operation.id),
    ...Object.keys(ownership.special),
  ]);
  for (const entry of Object.keys(overrides)) {
    if (!known.has(entry)) issues.push(`entrée inconnue : ${entry}`);
  }
  return issues;
}

/** Un seul écrivain : les mutations du contexte doivent toutes avoir le même propriétaire. */
export function assertSingleWriter(tables, overrides, context) {
  const { owners, writes } = writersOf(tables, overrides, context);
  if (owners.length > 1) {
    throw new CutoverError(
      'TWO_WRITERS',
      `contexte ${context} : mutations des deux côtés (${owners.join(', ')}) sur ${writes.join(', ')}`,
    );
  }
  return owners[0];
}

/** État compact : surcharge vide quand l'expansion rejoint le tableau versionné. */
export function compact(tables, overrides) {
  const expanded = expand(tables, overrides);
  const target = expand(tables, {});
  if (Object.entries(target).every(([entry, owner]) => expanded[entry] === owner)) return {};
  const wildcard = overrides[WILDCARD];
  const compacted = {};
  if (wildcard !== undefined) compacted[WILDCARD] = wildcard;
  for (const [entry, owner] of Object.entries(overrides)) {
    if (entry === WILDCARD) continue;
    // Une entrée explicite n'est utile que si elle diffère du joker (ou du tableau sans joker).
    const redundant = wildcard !== undefined ? owner === wildcard : owner === target[entry];
    if (!redundant) compacted[entry] = owner;
  }
  return compacted;
}

/** Produit la surcharge d'une étape de bascule ; lève `CutoverError` sur une combinaison incohérente. */
export function planCutover(tables, { stage, context, all = false, current = {} }) {
  if (!STAGES.includes(stage)) {
    throw new CutoverError(
      'UNKNOWN_STAGE',
      `étape inconnue : ${String(stage)} (${STAGES.join(', ')})`,
    );
  }
  const base = normaliseOverrides(current);
  const issues = checkOverrides(tables, base);
  if (issues.length > 0) {
    throw new CutoverError(
      'INCOHERENT_STATE',
      `surcharge de départ incohérente : ${issues.join(' ; ')}`,
    );
  }
  // Fin de bascule ou rollback total : plus aucune surcharge, ou tout relayé.
  if (all) {
    if (stage === 'rollback') return { [WILDCARD]: 'ts' };
    if (stage === 'writes') return {};
    throw new CutoverError('USAGE', '--all n’accepte que writes et rollback');
  }
  if (context === undefined) {
    throw new CutoverError('USAGE', '--context est requis (ou --all)');
  }
  const group = requireContext(tables.inventory, context);
  const { ownership } = tables;
  const next = { ...base };

  // Rollback : tout le contexte revient au relais, sans condition (c'est le chemin sûr).
  if (stage === 'rollback') {
    for (const id of [...group.reads, ...group.writes]) next[id] = 'ts';
    for (const id of group.writes) if (next[id] === undefined) next[id] = 'ts';
    return compact(tables, next);
  }

  const writer = assertSingleWriter(tables, base, context);
  if (stage === 'reads') {
    if (writer === 'py') {
      throw new CutoverError(
        'WRITES_FIRST',
        `contexte ${context} : les mutations sont déjà à py ; le canary en lecture exige qu’elles restent à ts (--relay-only)`,
      );
    }
    for (const id of group.reads) next[id] = 'py';
    for (const id of group.writes) if (next[id] === undefined) next[id] = 'ts';
    return compact(tables, next);
  }

  // stage === 'writes' : toutes les mutations du contexte d'un seul bloc, après le canary.
  const lagging = group.reads.filter((id) => ownerOf(id, ownership.operations, base) !== 'py');
  if (lagging.length > 0) {
    throw new CutoverError(
      'READS_NOT_PROMOTED',
      `contexte ${context} : canary de lecture non terminé (${lagging.join(', ')})`,
    );
  }
  for (const id of group.writes) next[id] = 'py';
  return compact(tables, next);
}

/** Sérialisation stable : le joker d'abord, puis les entrées triées. */
export function formatOverrides(overrides) {
  const ordered = {};
  if (overrides[WILDCARD] !== undefined) ordered[WILDCARD] = overrides[WILDCARD];
  for (const entry of Object.keys(overrides).sort()) {
    if (entry !== WILDCARD) ordered[entry] = overrides[entry];
  }
  return JSON.stringify(ordered);
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1] ?? '';
}

function readCurrent(argv) {
  const raw = argValue(argv, '--current');
  if (raw === undefined) return {};
  try {
    const text = raw.startsWith('@')
      ? raw === '@-'
        ? fs.readFileSync(0, 'utf8')
        : fs.readFileSync(raw.slice(1), 'utf8')
      : raw;
    return normaliseOverrides(text.trim() === '' ? {} : text);
  } catch (error) {
    if (error instanceof CutoverError) throw error;
    throw new CutoverError('INVALID_OVERRIDES', `--current illisible : ${error.message}`);
  }
}

function usage() {
  return [
    'Usage : node tools/deploy/cutover.mjs --context <ctx> --stage reads|writes|rollback [options]',
    '        node tools/deploy/cutover.mjs --all --stage writes|rollback',
    '',
    '  --context <ctx>   contexte de l’inventaire (agenda, tutor, billing…)',
    '  --all             tout le tableau (writes = fin de bascule, rollback = {"*":"ts"})',
    '  --stage <stage>   reads (canary), writes (promotion), rollback',
    '  --current <json>  surcharge déployée (JSON, @fichier ou @- pour stdin) ; défaut {}',
    '  --relay-only      raccourci de --current \'{"*":"ts"}\'',
    '  --check <json>    vérifie une surcharge sans rien produire',
    '  --out <fichier>   écrit la sortie dans un fichier au lieu de stdout',
    '  --inventory <f>   inventaire (tests) ; --ownership <f> tableau (tests)',
    '',
    'Sortie : la surcharge JSON sur stdout, résumé sur stderr. Code 0 = ok, 2 = refusé.',
  ].join('\n');
}

function loadTables(argv) {
  const inventoryFile = argValue(argv, '--inventory');
  const ownershipFile = argValue(argv, '--ownership');
  if (inventoryFile === undefined && ownershipFile === undefined) return readTables();
  const ownership = parseOwnership(
    fs.readFileSync(ownershipFile ?? path.join(ROOT, OWNERSHIP_FILE), 'utf8'),
  );
  const inventory = readInventory(
    fs.readFileSync(inventoryFile ?? path.join(ROOT, INVENTORY_FILE), 'utf8'),
  );
  return { ownership, inventory };
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  const tables = loadTables(argv);
  const check = argValue(argv, '--check');
  if (check !== undefined) {
    const overrides = normaliseOverrides(
      check.startsWith('@') ? fs.readFileSync(check.slice(1), 'utf8') : check,
    );
    const issues = checkOverrides(tables, overrides);
    if (issues.length > 0) {
      process.stderr.write(`${issues.join('\n')}\n`);
      return 2;
    }
    process.stderr.write('surcharge valide : un seul écrivain par contexte\n');
    return 0;
  }
  const stage = argValue(argv, '--stage');
  const all = argv.includes('--all');
  const context = argValue(argv, '--context');
  const current = argv.includes('--relay-only') ? { [WILDCARD]: 'ts' } : readCurrent(argv);
  const overrides = planCutover(tables, { stage, context, all, current });
  const text = formatOverrides(overrides);
  const out = argValue(argv, '--out');
  if (out !== undefined) fs.writeFileSync(out, `${text}\n`);
  else process.stdout.write(`${text}\n`);
  const summary = {
    stage,
    context: all ? '*' : context,
    entries: Object.keys(overrides).length,
    wildcard: overrides[WILDCARD] ?? null,
  };
  process.stderr.write(`${JSON.stringify(summary)}\n`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CutoverError) {
      process.stderr.write(`refus (${error.code}) : ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
