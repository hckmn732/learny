// Audit d'accessibilité générique des écrans mobiles (SPEC-3502 EF-2, ET-2 ; BR-PLA-02, BR-PLA-03).
//
// Un seul parcours d'arbre pour tous les écrans : le test `test/a11y/screens.test.tsx` rend chaque
// écran avec les données de démonstration puis appelle `auditScreen`. Aucune règle n'est recopiée
// écran par écran, donc une cible ajoutée plus tard est auditée sans modifier le test.
//
// Quatre familles de règles :
//   1. rôle : toute cible interactive expose un `accessibilityRole` (bouton, lien, onglet…) ;
//   2. libellé : toute cible annonce un texte lisible (libellé explicite, texte enfant ou valeur) ;
//   3. état : un interrupteur, une case ou un bouton radio annonce `accessibilityState.checked` ;
//   4. cible tactile : une dimension déclarée atteint le minimum de la plateforme (48 dp Android,
//      44 pt iOS), `hitSlop` compris (canevas § 3) ; une hauteur connue est toujours vérifiée.
//
// L'écran doit annoncer au moins un titre (`accessibilityRole="header"`) : c'est le repère de
// navigation d'un lecteur d'écran (BR-PLA-03, ordre de lecture).
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

/** Résultat d'un audit : violations, cibles examinées, titres annoncés. */
export interface A11yAudit {
  readonly violations: readonly A11yViolation[];
  readonly interactive: number;
  readonly labeled: number;
  readonly headers: number;
}

/**
 * Nœud de l'arbre de rendu, tel qu'il est parcouru : la forme minimale dont l'audit a besoin.
 * Le type de `react-test-renderer` n'est pas une dépendance directe du paquet mobile ; cette forme
 * locale évite de dépendre de son implémentation.
 */
export interface TestNode {
  readonly type?: unknown;
  readonly props?: Record<string, unknown>;
  readonly children?: (TestNode | string | null | undefined)[];
}

interface Props {
  readonly accessibilityRole?: unknown;
  readonly accessibilityLabel?: unknown;
  readonly accessibilityState?: unknown;
  readonly accessibilityElementsHidden?: unknown;
  readonly importantForAccessibility?: unknown;
  readonly onPress?: unknown;
  readonly style?: unknown;
  readonly hitSlop?: unknown;
  readonly testID?: unknown;
  readonly value?: unknown;
}

function propsOf(node: TestNode): Props {
  return node.props ?? {};
}

function testIdOf(node: TestNode): string {
  const { testID } = propsOf(node);
  return typeof testID === 'string' ? testID : '<sans testID>';
}

/** Texte lisible porté par un nœud ou l'un de ses descendants. */
function textOf(node: TestNode): string {
  const chunks: string[] = [];
  const walk = (current: TestNode): void => {
    for (const child of current.children ?? []) {
      if (typeof child === 'string') {
        chunks.push(child);
        continue;
      }
      if (child !== null && child !== undefined) walk(child);
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

/** Taille effective d'un nœud, `hitSlop` compris, et dimensions réellement déclarées. */
export function targetSize(node: TestNode): {
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
    // Une dimension non déclarée est inconnue : le nœud occupe la place que son parent lui donne
    // (rangée pleine largeur, texte au fil du flux) et le `hitSlop` seul ne la mesure pas.
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

/** Parcourt l'arbre rendu et renvoie les écarts des quatre familles de règles. */
export function auditScreen(view: RenderResult, minTarget: number = MIN_TARGET): A11yAudit {
  const violations: A11yViolation[] = [];
  let interactive = 0;
  let labeled = 0;
  let headers = 0;

  const walk = (
    node: TestNode | null | undefined,
    inherited: { width: number; height: number } = { width: 0, height: 0 },
  ): void => {
    if (node === null || node === undefined) return;
    const props = propsOf(node);
    if (isHidden(props)) return;

    const role = typeof props.accessibilityRole === 'string' ? props.accessibilityRole : undefined;
    const acts = typeof props.onPress === 'function';
    const isInteractive = acts || (role !== undefined && INTERACTIVE_ROLES.has(role));

    if (role === 'header') headers += 1;

    // Un interrupteur, une case ou un bouton radio annonce son état : sans `accessibilityState`,
    // TalkBack lit « Bouton » sans dire s'il est coché (BR-PLA-03).
    if (role === 'switch' || role === 'checkbox' || role === 'radio') {
      const state = props.accessibilityState as { checked?: unknown } | undefined;
      if (state === undefined || typeof state.checked !== 'boolean') {
        violations.push({
          testID: testIdOf(node),
          rule: 'state',
          detail: `role ${role} sans accessibilityState.checked`,
        });
      }
    }

    /** Plus grande dimension de la chaîne interactive, transmise aux descendants. */
    let next = inherited;

    if (isInteractive) {
      interactive += 1;
      const explicit =
        typeof props.accessibilityLabel === 'string' ? props.accessibilityLabel.trim() : '';
      const value = typeof props.value === 'string' ? props.value.trim() : '';
      const text = textOf(node);
      const announced = [explicit, value, text].find((candidate) => candidate !== '') ?? '';

      if (role === undefined) {
        violations.push({
          testID: testIdOf(node),
          rule: 'role',
          detail: 'cible interactive sans accessibilityRole',
        });
      }
      if (announced === '') {
        violations.push({
          testID: testIdOf(node),
          rule: 'label',
          detail: 'cible interactive sans libellé annoncé (bouton d’icône muet ?)',
        });
      } else {
        labeled += 1;
      }

      // Une cible peut atteindre le minimum par son conteneur pressable (un texte dans un bouton de
      // 48 dp) : la mesure retient la plus grande dimension de la chaîne interactive.
      const own = targetSize(node);
      const size = {
        width: Math.max(own.width, inherited.width),
        height: Math.max(own.height, inherited.height),
      };
      next = {
        width: own.hasWidth ? size.width : inherited.width,
        height: own.hasHeight ? size.height : inherited.height,
      };

      // Largeur : seuls les contrôles qui la déclarent sont mesurés (bouton d'icône, puce) ; une
      // rangée pleine largeur occupe la largeur de son parent. Hauteur : dès qu'elle est connue.
      const heightKnown = own.hasHeight || inherited.height > 0;
      for (const [axis, measure, measurable] of [
        ['largeur', size.width, own.hasWidth],
        ['hauteur', size.height, heightKnown],
      ] as const) {
        if (measurable && measure > 0 && measure < minTarget) {
          violations.push({
            testID: testIdOf(node),
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

  const root = (view as unknown as { root?: TestNode }).root;
  if (root === undefined) throw new Error('Racine de rendu absente : audit impossible.');
  walk(root);

  if (headers === 0) {
    violations.push({
      testID: '<écran>',
      rule: 'header',
      detail: 'aucun titre annoncé (accessibilityRole="header")',
    });
  }
  return { violations, interactive, labeled, headers };
}
