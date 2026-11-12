---
id: SPEC-308
title: "Pages système et mise en page d'authentification"
phase: P3
priority: V1
depends_on: [SPEC-303]
business_rules: []
screens: [SCR-20, SCR-01]
adrs: []
visual: tokens
---

# SPEC-308 — Pages système et mise en page d'authentification

## 1. Objectif

not-found, error (avec requestId), chargement global, accès refusé ; mise en page divisée de l'authentification (panneau sombre Learny + carte) reprise de Inscription.dc.html. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` pour les règles transverses, `docs/product/screens.md` pour SCR-20 (pages système) et SCR-01 (inscription, connexion, vérification), `design/maquettes/Inscription.dc.html`, `docs/architecture/overview.md` §3–§4, `docs/architecture/api.md`, `docs/engineering/conventions.md` §4–§9 et `docs/engineering/testing.md` §1–§7. SPEC-006 a créé les pages d’erreur minimales : cette spécification les compose avec les composants de SPEC-303 et ajoute la mise en page d’authentification. Les maquettes restent en lecture seule.

## 3. Dépendances

- **SPEC-303** — Composants de base II : structure et retours.
- Les contrats Zod et services existants restent la source des DTO ; aucune donnée d’un autre utilisateur n’est chargée dans la coquille. Les tests utilisent `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` et `LLM_MODE=mock`.

## 4. Règles métier couvertes

Aucune règle métier directe ; les contraintes transverses du produit et les ADR cités restent applicables.

## 5. Exigences fonctionnelles

- **EF-1** — Les routes de système exposent 404, erreur récupérable, erreur racine, chargement et accès refusé avec titre français, explication courte, action de reprise et identifiant de requête seulement s’il existe.
- **EF-2** — Les erreurs inattendues n’exposent ni pile, nom de table, URL interne, secret ni contenu d’apport. Le bouton Réessayer relance `reset()` lorsque l’erreur est récupérable.
- **EF-3** — Le layout d’authentification place le panneau Learny sombre à gauche et la carte de formulaire à droite sur desktop, puis les empile sur mobile, sans menu connecté.
- **EF-4** — Inscription, connexion et vérification réutilisent ce layout ; les titres, labels et messages restent spécifiques à leur étape.
- **EF-5** — Une session expirée sur un écran connecté mène à Connexion et la page de retour n’est acceptée que si son chemin est local et autorisé.

## 6. Exigences techniques

- **ET-1** — Créer les pages système `not-found`, `error`, `global-error`, `loading` et accès refusé avec les composants de SPEC-303, textes français et identifiant de requête lorsqu’il existe.
- **ET-2** — L’erreur ne rend jamais de pile, nom de table, clé, adresse interne ou contenu d’apport. « Réessayer » invoque `reset()` pour une erreur récupérable ; une 404 donne un lien vers l’accueil ou la connexion selon la session.
- **ET-3** — Le layout d’authentification est partagé par inscription, connexion et vérification : panneau sombre Learny et carte claire ; il ne monte pas la coquille connectée.
- **ET-4** — Les entrées et réponses sont validées par les schémas partagés de `packages/contracts` ; les mutations passent par `packages/services`, utilisent la session utilisateur et ne dépendent pas d’un état client faisant autorité. Les chaînes visibles sont centralisées dans `apps/web/messages/fr.ts`.
- **ET-5** — Chaque composant interactif possède un nom accessible, un focus visible et un `data-testid` stable ; les données asynchrones ont chargement, vide et erreur avec réessai. Les dates sont formatées dans le fuseau de l’utilisateur avec l’horloge injectable.

## 7. Comportements attendus et cas limites

- **CL-1** — JavaScript désactivé : le texte et le lien principal restent visibles.
- **CL-2** — Identifiant de requête absent : ne pas afficher de valeur factice.
- **CL-3** — Session expirée sur une route connectée : redirection vers Connexion et retour contrôlé.
- **CL-4** — Erreur dans le layout racine : `global-error` fournit ses propres balises html/body.

## 8. Instructions d'implémentation

1. Lire les contrats des dépendances et la maquette ; relever les régions, textes, états et interactions exacts avant d’écrire les composants. Préserver les composants `@learny/ui` déjà livrés.
2. Définir les DTO et services nécessaires, puis écrire `apps/web/components/auth/auth-layout.tsx` avec les comportements EF et les cas limites CL. Les données ne sont accessibles qu’au propriétaire ou au membre autorisé selon RLS.
3. Ajouter les états chargement, vide et erreur, le responsive, le clavier, le focus et les messages français ; brancher la page ou la coquille sur les routes existantes. Commits atomiques `feat(SPEC-308): …`.
4. Écrire les tests unitaires, d’intégration et navigateur de la section 12, avec leurs étiquettes, capture et vidéo. Commit `test(SPEC-308): …`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-308`, consigner les preuves observées dans `evidence/SPEC-308/acceptance.md`, corriger jusqu’au vert puis exécuter `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/app/acces-refuse/page.tsx`, `apps/web/app/(auth)/layout.tsx`, `apps/web/components/auth/auth-layout.tsx`, `apps/web/e2e/specs/p3/spec-308.spec.ts`, `apps/web/components/auth/auth-layout.test.tsx`, `apps/web/test/integration/system-pages.test.ts`.
- **Modifiés** : `apps/web/app/not-found.tsx`, `apps/web/app/error.tsx`, `apps/web/app/global-error.tsx`, `apps/web/app/loading.tsx` (pages minimales de SPEC-006), `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/ui`, services et routes des dépendances, `docs/product/screens.md`, maquette de la section 10 ; dépendances SPEC-303.

## 10. Interface et conformité visuelle

Mode `tokens`. SCR-01 : `design/maquettes/Inscription.dc.html`, panneau sombre et carte d’authentification. SCR-20 : aucun mockup, reprendre PageHeader, Card, Button, EmptyState du design system pour 404, erreur et chargement. Comparer uniquement le layout d’authentification à la maquette ; autres pages par jetons et capture de non-régression. Les états chargement, vide, erreur et réussite doivent être représentés ; tous les contrôles ont un libellé et un ordre de tabulation cohérent. Vérifier `expectTokens`, les régions et textes attendus, la comparaison à la référence si une maquette s’applique (écart ≤ 12 %), puis `toHaveScreenshot` avec `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — Les cinq états système ont un h1, une action utile et aucun détail interne dans le HTML rendu.
- **CA-2** — Une erreur récupérable déclenche `reset()` exactement une fois par activation ; l’identifiant de requête présent est affiché, celui absent n’est pas inventé.
- **CA-3** — Le layout d’authentification apparaît sur inscription, connexion et vérification sans menu connecté ; la disposition mobile ne déborde pas à 390 px.
- **CA-4** — Une redirection après session expirée refuse toute URL de retour externe.
- **CA-5** — Le layout d’authentification correspond à Inscription.dc.html (écart ≤ 12 %) ; les pages système passent jetons, axe et captures avec vidéo.

## 12. Plan de tests

- **Unitaires** — `apps/web/components/auth/auth-layout.test.tsx`, `describe('[SPEC-308] Pages système et mise en page d'authentification')` : mise en page d’authentification desktop et mobile ; données vides, limites et accessibilité des contrôles (CA-1 à CA-3).
- **Intégration** — `apps/web/test/integration/system-pages.test.ts`, `describe('[SPEC-308] Pages système et mise en page d'authentification service')` : 404 et accès refusé sans information interne, RLS avec deux utilisateurs et réponse d’erreur sûre (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p3/spec-308.spec.ts`, `test('Pages système et mise en page d'authentification @SPEC-308')` : erreur récupérable et bouton Réessayer, vérifier les textes et l’URL, capturer l’état final et conserver la vidéo (CA-1, CA-4, CA-5).
- **Visuel** — `test('Pages système et mise en page d'authentification @SPEC-308 @visual')` : jetons, structure, axe, capture desktop 1440×900 et mobile 390×844 ; comparaison de maquette si applicable (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-303]` / `@SPEC-303`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration ; e2e |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-308/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-308`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Les comportements, bornes et textes de la section 5 sont observés ; l’accès d’un autre utilisateur ne révèle pas ces données.

## 15. Décisions et hypothèses

Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.

- **ADR-0272** — Pages système et layout d’authentification : frontière d’erreur (`reset` unique, identifiant seulement pour un `AppError`), 404 dont l’action principale dépend de la session tout en conservant le lien d’accueil, coquilles `/inscription`, `/connexion` et `/verifier-email` livrées par cette spécification avant leur complétion par SPEC-601, layout `(auth)` partagé et stepper dérivé du chemin, `global-error` testable via `GlobalErrorView`, routes `/hors-ligne` et `/acces-refuse`, comparaison visuelle du panneau gauche de `SCR-01-base-desktop.png` (343 × 900).
