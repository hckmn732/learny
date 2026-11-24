// Audit d'accessibilité générique des écrans mobiles (SPEC-3502 EF-2, ET-2 ; BR-PLA-02, BR-PLA-03).
//
// Un seul parcours d'arbre pour tous les écrans : le test `test/a11y/screens.test.tsx` rend chaque
// écran avec les données de démonstration puis appelle `auditScreen`. Aucune règle n'est recopiée
// écran par écran, donc une cible ajoutée demain est auditée sans toucher au test.
//
// Trois familles de règles :
//   1. rôle : toute cible interactive expose un `accessibilityRole` (bouton, lien, onglet…)
//   2. libellé : toute cible annonce un texte lisible (libellé explicite, texte enfant ou valeur)
//   3. cible tactile : une dimension déclarée atteint le minimum de la plateforme (48 dp Android,
//      44 pt iOS), `hitSlop` compris (canevas § 3).
import type { ReactTestInstance } from 'react-test-renderer';
import type { RenderResult } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

/** Rôles qui rendent un nœud actionnable pour un lecteur d'écran. */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'tab',
  'switch',
  'checkbox',
  'radio',
  'search',
  'adjustable',
  'togglebutton',
]);

/** Un écart d'accessibilité, nommé pour que l'échec dise quoi corriger. */
export interface A11yViolation {
  readonly testID: string;
  readonly rule: 'role' | 'label' | 'target' | 'state' | 'header';
  readonly detail: string;
}

/** Résultat d'un audit : violations et nombre de cibles examinées. */
export interface A11yAudit {
  readonly violations: readonly A11yViolation[];
  readonly interactive: number;
  readonly labeled: number;
  /** L'ecran annonce au moins un titre (repere de navigation d'un lecteur d'ecran). */
  readonly headers: number;
}

interface Props {
  readonly accessibilityRole?: unknown;
  readonly accessibilityLabel?: unknown;
  readonly accessible?: unknown;
  readonly accessibilityElementsHidden?: unknown;
  readonly importantForAccessibility?: unknown;
  readonly onPress?: unknown;
  readonly style?: unknown;
  readonly hitSlop?: unknown;
  readonly children?: unknown;
  readonly value?: unknown;
  readonly placeholder?: unknown;
  readonly testID?: unknown;
}

function propsOf(node: ReactTestInstance): Props {
  return node.props as Props;
}

function testIdOf(node: ReactTestInstance): string {
  const { testID } = propsOf(node);
  return typeof testID === 'string' ? testID : '<sans testID>';
}

/** Texte lisible porté par un nœud ou l'un de ses descendants. */
function textOf(node: ReactTestInstance): string {
  const chunks: string[] = [];
  const walk = (current: ReactTestInstance): void => {
    for (const child of current.children ?? []) {
      if (typeof child === 'string') {
        chunks.push(child);
        continue;
      }
      walk(child);
    }
  };
  walk(node);
  return chunks.join(' ').replace(/\s+/gu, ' ').trim();
}

function numeric(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function best(first: number, second: number): number {
  if (Number.isNaN(first)) return Number.isNaN(second) ? 0 : second;
  if (Number.isNaN(second)) return first;
  return Math.max(first, second);
}

/** Somme du `hitSlop` sur un axe (nombre uniforme ou objet par bord). */
function hitSlopSum(slop: unknown, axis: 'horizontal' | 'vertical'): number {
  if (typeof slop === 'number') return slop * 2;
  if (typeof slop !== 'object' || slop === null) return 0;
  const { left = 0, right = 0, top = 0, bottom = 0 } = slop as Record<string, number>;
  return axis === 'horizontal' ? left + right : top + bottom;
}

interface FlatStyle {
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
}

/** Hauteur et largeur effectives déclarées, `hitSlop` compris (0 quand rien n'est déclaré). */
export function targetSize(node: ReactTestInstance): {
  width: number;
  height: number;
  hasWidth: boolean;
  hasHeight: boolean;
} {
  const props = propsOf(node);
  const style = StyleSheet.flatten(props.style as never) as FlatStyle | undefined;
  const width = best(numeric(style?.width), numeric(style?.minWidth));
  const height = best(numeric(style?.height), numeric(style?.minHeight));
  return {
    width: width + hitSlopSum(props.hitSlop, 'horizontal'),
    height: height + hitSlopSum(props.hitSlop, 'vertical'),
    // Une dimension non declaree est inconnue : le noeud occupe la place que son parent lui donne
    // (rangee pleine largeur, texte au fil du flux) et le hitSlop seul ne la mesure pas.
    hasWidth: width > 0,
    hasHeight: height > 0,
  };
}

/** Minimum tactile de la plateforme de la validation (ADR-3004 § 6 : Android). */
export const MIN_TARGET = Platform.OS === 'ios' ? 44 : 48;

function isHidden(props: Props): boolean {
  return (
    props.accessibilityElementsHidden === true ||
    props.importantForAccessibility === 'no-hide-descendants'
  );
}

/** Parcourt l'arbre rendu et renvoie les écarts des trois familles de règles. */
export function auditScreen(view: RenderResult, minTarget: number = MIN_TARGET): A11yAudit {
  const violations: A11yViolation[] = [];
  let interactive = 0;
  let labeled = 0;
  let headers = 0;
  /** Plus grande cible de la chaîne interactive, transmise aux descendants. */
  let next: { width: number; height: number } = { width: 0, height: 0 };

  const walk = (
    node: ReactTestInstance | null | undefined,
    inherited: { width: number; height: number } = { width: 0, height: 0 },
  ): void => {
    if (node === null || node === undefined) return;
    next = inherited;
    const props = propsOf(node);
    if (isHidden(props)) return;

    const role = typeof props.accessibilityRole === 'string' ? props.accessibilityRole : undefined;
    const acts = typeof props.onPress === 'function';
    const isInteractive = acts || (role !== undefined && INTERACTIVE_ROLES.has(role));

    if (role === 'header') headers += 1;

    // Un interrupteur, une case ou un bouton radio annonce son etat : sans `accessibilityState`,
    // TalkBack lit « Bouton » sans dire s'il est coche (BR-PLA-03).
    if (role === 'switch' || role === 'checkbox' || role === 'radio') {
      const state = (props as { accessibilityState?: { checked?: unknown } }).accessibilityState;
      if (state === undefined || typeof state.checked !== 'boolean') {
        violations.push({
          testID: testIdOf(node),
          rule: 'state',
          detail: `role ${role} sans accessibilityState.checked`,
        });
      }
    }

    if (isInteractive) {
      interactive += 1;
      const id = testIdOf(node);
      const explicit = typeof props.accessibilityLabel === 'string' ? props.accessibilityLabel.trim() : '';
      const value = typeof props.value === 'string' ? props.value.trim() : '';
      const text = textOf(node);
      const announced = [explicit, value, text].find((candidate) => candidate !== '') ?? '';

      if (role === undefined) {
        violations.push({
          testID: id,
          rule: 'role',
          detail: 'cible interactive sans accessibilityRole',
        });
      }
      if (announced === '') {
        violations.push({
          testID: id,
          rule: 'label',
          detail: 'cible interactive sans libellé annoncé (bouton d’icône muet ?)',
        });
      } else {
        labeled += 1;
      }

      // Une cible peut atteindre le minimum par son conteneur pressable (un texte dans un bouton
      // de 48 dp) : la mesure retient la plus grande dimension de la chaîne interactive.
      const own = targetSize(node);
      const size = {
        width: Math.max(own.width, inherited.width),
        height: Math.max(own.height, inherited.height),
      };
      // Une dimension qu'aucun nœud de la chaîne ne déclare n'est pas mesurable : elle est ignorée
      // (une rangée pleine largeur n'a pas de largeur explicite et satisfait toujours la règle).
      const known = {
        width: own.hasWidth || inherited.width > 0,
        height: own.hasHeight || inherited.height > 0,
      };
      next = {
        width: own.hasWidth ? size.width : inherited.width,
        height: own.hasHeight ? size.height : inherited.height,
      };
      // Largeur : seuls les controles qui la declarent sont mesures (bouton d'icone, puce) ; une
      // rangee pleine largeur occupe la largeur de son parent. Hauteur : des qu'elle est connue.
      for (const [axis, measure, measurable] of [
        ['largeur', size.width, own.hasWidth],
        ['hauteur', size.height, known.height],
      ] as const) {
        if (measurable && measure > 0 && measure < minTarget) {
          violations.push({
            testID: id,
            rule: 'target',
            detail: `${axis} ${String(Math.round(measure))} < ${String(minTarget)}`,
          });
        }
      }
    }

    for (const child of node.children ?? []) {
      if (child !== null && child !== undefined && typeof child !== 'string') walk(child, next);
    }
  };

  // RNTL 14 expose la racine sous `root` ; `UNSAFE_root` n'est plus alimenté.
  const root = (view as unknown as { root?: ReactTestInstance }).root;
  if (root === undefined) throw new Error('Racine de rendu absente : audit impossible.');
  walk(root);
  if (headers === 0) {
    violations.push({
      testID: '<ecran>',
      rule: 'header',
      detail: 'aucun titre annonce (accessibilityRole="header")',
    });
  }
  return { violations, interactive, labeled, headers };
}
