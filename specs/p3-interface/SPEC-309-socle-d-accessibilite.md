---
id: SPEC-309
title: "Socle d'accessibilité"
phase: P3
priority: V1
depends_on: [SPEC-303]
business_rules: [BR-PLA-03]
screens: []
adrs: [ADR-0038]
visual: tokens
---

# SPEC-309 — Socle d'accessibilité

## 1. Objectif

Lien d'évitement, gestion du focus des panneaux, annonces aria-live, prefers-reduced-motion, contrastes vérifiés des jetons, helper axe dans @learny/testing, audit des composants de la galerie. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` pour BR-PLA-03, `docs/product/screens.md` pour les motifs communs, `docs/architecture/overview.md` §3–§4, `docs/architecture/api.md`, `docs/engineering/conventions.md` §4–§9 et `docs/engineering/testing.md` §1–§7. ADR applicables : ADR-0038. Le contenu et les états de la maquette citée en section 10 font foi, sans modification de `design/maquettes/`.

## 3. Dépendances

- **SPEC-303** — Composants de base II : structure et retours.
- Les contrats Zod et services existants restent la source des DTO ; aucune donnée d’un autre utilisateur n’est chargée dans la coquille. Les tests utilisent `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` et `LLM_MODE=mock`.

## 4. Règles métier couvertes

- **BR-PLA-03** — Accessibilité WCAG 2.2 AA : navigation clavier complète, focus visible, rôles ARIA, contrastes, `prefers-reduced-motion`, aucune violation axe de niveau serious/critical.

## 5. Exigences fonctionnelles

- **EF-1** — Sur chaque écran connecté, le premier lien clavier « Aller au contenu » devient visible au focus et déplace le focus sur le contenu principal.
- **EF-2** — Chaque dialogue, menu et panneau conserve un nom accessible, piège le focus quand il est modal et le rend au déclencheur à la fermeture ; une cible supprimée utilise le titre de la page.
- **EF-3** — Les résultats des actions asynchrones sont annoncés par une région `aria-live` sans répétition à chaque re-render ; les erreurs prioritaires sont annoncées assertivement.
- **EF-4** — Sous `prefers-reduced-motion: reduce`, les animations décoratives des composants s’arrêtent et leur état final est immédiatement disponible.
- **EF-5** — La galerie démontre au clavier les composants livrés par SPEC-301 à 303 et une analyse axe automatisée sans violation serious/critical.

## 6. Exigences techniques

- **ET-1** — Le layout connecté offre un lien d’évitement « Aller au contenu » visible au focus et ciblant `main#contenu-principal`; les pages ont un seul h1 et des régions nommées.
- **ET-2** — Les panneaux, dialogues et menus de SPEC-303 rendent le focus au déclencheur ; les mutations asynchrones utilisent `aria-live` adapté sans doublons d’annonce.
- **ET-3** — Les animations non essentielles sont supprimées sous `prefers-reduced-motion: reduce`; les contrastes des paires de jetons utilisées par la galerie satisfont WCAG 2.2 AA. Le helper axe de `@learny/testing` échoue pour serious/critical.
- **ET-4** — Les entrées et réponses sont validées par les schémas partagés de `packages/contracts` ; les mutations passent par `packages/services`, utilisent la session utilisateur et ne dépendent pas d’un état client faisant autorité. Les chaînes visibles sont centralisées dans `apps/web/messages/fr.ts`.
- **ET-5** — Chaque composant interactif possède un nom accessible, un focus visible et un `data-testid` stable ; les données asynchrones ont chargement, vide et erreur avec réessai. Les dates sont formatées dans le fuseau de l’utilisateur avec l’horloge injectable.

## 7. Comportements attendus et cas limites

- **CL-1** — Panneau fermé après suppression de son déclencheur : focus sur le titre de la page, jamais sur body.
- **CL-2** — Annonce répétée à chaque re-render : dédupliquer le message.
- **CL-3** — Zoom navigateur 200 % ou 400 % : aucun contrôle masqué ni défilement horizontal inutile.
- **CL-4** — Mouvement réduit : transitions décoratives nulles, état final immédiatement disponible.

## 8. Instructions d'implémentation

1. Lire les contrats des dépendances et la maquette ; relever les régions, textes, états et interactions exacts avant d’écrire les composants. Préserver les composants `@learny/ui` déjà livrés.
2. Définir les DTO et services nécessaires, puis écrire `packages/ui/src/accessibility/index.ts` avec les comportements EF et les cas limites CL. Les données ne sont accessibles qu’au propriétaire ou au membre autorisé selon RLS.
3. Ajouter les états chargement, vide et erreur, le responsive, le clavier, le focus et les messages français ; brancher la page ou la coquille sur les routes existantes. Commits atomiques `feat(SPEC-309): …`.
4. Écrire les tests unitaires, d’intégration et navigateur de la section 12, avec leurs étiquettes, capture et vidéo. Commit `test(SPEC-309): …`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-309`, consigner les preuves observées dans `evidence/SPEC-309/acceptance.md`, corriger jusqu’au vert puis exécuter `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ui/src/accessibility/skip-link.tsx`, `packages/ui/src/accessibility/live-region.tsx`, `packages/ui/src/accessibility/focus-return.ts`, `packages/ui/src/styles/accessibility.css`, `packages/testing/src/axe.ts`, `apps/web/e2e/specs/p3/spec-309.spec.ts`, `packages/ui/src/accessibility/focus-return.test.ts`, `packages/ui/test/integration/accessibility.test.tsx`.
- **Modifiés** : `apps/web/messages/fr.ts`, `apps/web/components/shell/app-shell.tsx` ou la route liée à Socle d'accessibilité, exports de `packages/contracts/src/index.ts` si un DTO est ajouté.
- **Lus / réutilisés** : `@learny/ui`, services et routes des dépendances, `docs/product/screens.md`, maquette de la section 10 ; dépendances SPEC-303.

## 10. Interface et conformité visuelle

Mode `tokens`. Mode `tokens`, galerie des composants de SPEC-301 à SPEC-303 : vérifier états focus, contrastes, lien d’évitement et mouvement réduit. Aucune maquette dédiée ; capturer focus clavier visible et zoom 200 % en desktop/mobile, plus axe sur les pages de galerie. Les états chargement, vide, erreur et réussite doivent être représentés ; tous les contrôles ont un libellé et un ordre de tabulation cohérent. Vérifier `expectTokens`, les régions et textes attendus, la comparaison à la référence si une maquette s’applique (écart ≤ 12 %), puis `toHaveScreenshot` avec `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — Tab depuis le haut d’une page connectée révèle « Aller au contenu » et Entrée place le focus sur `main#contenu-principal`.
- **CA-2** — Ouverture/fermeture de chaque famille de panneau conserve un ordre clavier valide et rend le focus au déclencheur ou au titre si le déclencheur a disparu.
- **CA-3** — Les paires de jetons visibles respectent les contrastes WCAG 2.2 AA ; axe ne remonte aucune violation serious/critical dans la galerie.
- **CA-4** — Avec mouvement réduit et zoom 200 %/400 %, les contrôles restent utilisables sans animation décorative ni débordement horizontal inutile.
- **CA-5** — Les états de focus et la galerie passent le test visuel `@visual` et une vidéo Playwright est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/ui/src/accessibility/focus-return.test.ts`, `describe('[SPEC-309] Socle d'accessibilité')` : navigation clavier et lien d’évitement ; données vides, limites et accessibilité des contrôles (CA-1 à CA-3).
- **Intégration** — `packages/ui/test/integration/accessibility.test.tsx`, `describe('[SPEC-309] Socle d'accessibilité service')` : ouverture et fermeture de panneaux avec retour du focus, RLS avec deux utilisateurs et réponse d’erreur sûre (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p3/spec-309.spec.ts`, `test('Socle d'accessibilité @SPEC-309')` : mouvement réduit, zoom et axe sans serious/critical, vérifier les textes et l’URL, capturer l’état final et conserver la vidéo (CA-1, CA-4, CA-5).
- **Visuel** — `test('Socle d'accessibilité @SPEC-309 @visual')` : jetons, structure, axe, capture desktop 1440×900 et mobile 390×844 ; comparaison de maquette si applicable (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-303]` / `@SPEC-303`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration ; e2e |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-309/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-309`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Les comportements, bornes et textes de la section 5 sont observés ; l’accès d’un autre utilisateur ne révèle pas ces données.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0038. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
