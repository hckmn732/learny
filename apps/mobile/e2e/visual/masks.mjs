// Masques de comparaison visuelle par flux (SPEC-3101, ADR-3003 § 4, ADR-3011).
//
// `apps/mobile/e2e/visual/masks/<flux>.json` décrit, en ratios 0-1 de la référence, les zones
// retirées de la comparaison — jamais le seuil de 12 % (ADR-3003 § 4). Un flux sans fichier garde
// exactement le comportement d'avant : seules les zones natives (barre d'état, indicateur
// d'accueil) sont masquées.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flowSlug } from '../artifacts.mjs';

import { parseMask } from './compare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Répertoire versionné des masques. */
export const MASKS_DIR = path.join(HERE, 'masks');

/** Ratio invalidé : le fichier doit contenir une liste de rectangles numériques. */
function toRect(rect, file) {
  const [x, y, width, height] = [rect?.x, rect?.y, rect?.width, rect?.height].map(Number);
  if (![x, y, width, height].every((value) => Number.isFinite(value))) {
    throw new Error(`masque invalide (ratios numériques attendus) : ${file}`);
  }
  return { x, y, width, height };
}

/**
 * Masque d'un flux en ratios, ou `null` quand aucun fichier n'existe. Le fichier porte le même
 * identifiant que le rapport de flux (`flowSlug`) pour qu'un artefact ne puisse pas hériter du
 * masque d'un autre (ADR-3015 § 2).
 */
export function loadFlowMask(flowName, masksDir = MASKS_DIR) {
  const file = path.join(masksDir, `${flowSlug(flowName)}.json`);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`masque invalide (liste attendue) : ${file}`);
  return parsed.map((rect) => toRect(rect, file));
}

/**
 * Rectangles en pixels de la référence : zones natives (masquées par défaut) puis zones du flux.
 * `null` quand le flux n'a pas de masque, pour laisser `compareFlows` appliquer ses défauts.
 */
export function maskRectsFor(flowName, width, height, masksDir = MASKS_DIR) {
  const ratios = loadFlowMask(flowName, masksDir);
  if (ratios === null) return null;
  const native = parseMask('top=0.05,bottom=0.05', width, height);
  const custom = ratios.map((rect) => ({
    x: Math.round(rect.x * width),
    y: Math.round(rect.y * height),
    width: Math.round(rect.width * width),
    height: Math.round(rect.height * height),
  }));
  return [...native, ...custom];
}
