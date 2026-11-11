---
id: SPEC-305
title: "Coquille : en-tête figé et menu Mon compte"
phase: P3
priority: V1
depends_on: [SPEC-304]
business_rules: [BR-NAV-01, BR-ACC-09]
screens: [SCR-03]
adrs: []
visual: mockup
---

# SPEC-305 — Coquille : en-tête figé et menu Mon compte

## 1. Objectif

En-tête collant translucide : bouton afficher le menu, recherche (champ), cloche (bouton), Mon compte (avatar, menu : identité, Paramètres, Mettre en pause, Se déconnecter) ; gestion du focus, Échap, clic extérieur. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` pour BR-NAV-01, BR-ACC-09, `docs/product/screens.md` pour SCR-03 (Accueil, route `/accueil` (`/` redirige), maquette `Main.dc.html`), `docs/architecture/overview.md` §3–§4, `docs/architecture/api.md`, `docs/engineering/conventions.md` §4–§9 et `docs/engineering/testing.md` §1–§7. Le contenu et les états de la maquette citée en section 10 font foi, sans modification de `design/maquettes/`.

## 3. Dépendances

- **SPEC-304** — Coquille : menu latéral.
- Les contrats Zod et services existants restent la source des DTO ; aucune donnée d’un autre utilisateur n’est chargée dans la coquille. Les tests utilisent `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` et `LLM_MODE=mock`.

## 4. Règles métier couvertes

- **BR-NAV-01** — En-tête figé sur tous les écrans connectés : recherche globale, cloche de notifications, menu « Mon compte » (prénom, nombre de formations en cours, Paramètres, Mettre en pause, Se déconnecter).
- **BR-ACC-09** — « Se déconnecter » (menu Mon compte) ferme la session et mène à l'écran de connexion.

## 5. Exigences fonctionnelles

- **EF-1** — L’en-tête reste visible lors du défilement de chaque écran connecté et contient, dans cet ordre, bouton Afficher le menu si nécessaire, champ de recherche, cloche avec nombre non lu, avatar et bouton Mon compte.
- **EF-2** — Mon compte ouvre un menu affichant le prénom, le nombre de formations en cours, Paramètres, Mettre en pause et Se déconnecter. Le menu se ferme par Échap, clic extérieur ou activation d’une action et rend le focus au déclencheur.
- **EF-3** — Paramètres mène à `/parametres`; Mettre en pause lance le flux de SPEC-618 lorsqu’il est disponible ; Se déconnecter invalide la session par SPEC-202 puis mène à `/connexion`.
- **EF-4** — L’avatar reprend les initiales du profil et le nombre de formations est calculé par le service autorisé, sans compter les formations terminées.
- **EF-5** — Sur mobile, les actions restent atteignables au clavier et conservent leurs noms accessibles ; l’en-tête n’introduit pas de défilement horizontal.

## 6. Exigences techniques

- **ET-1** — L’en-tête est commun aux écrans connectés, sauf la mise en page d’authentification et l’épreuve d’examen blanc. Le bouton de recherche annonce le champ ; la cloche annonce le nombre non lu.
- **ET-2** — Le menu Mon compte utilise `DropdownMenu` de SPEC-303, affiche prénom et nombre de formations actives, puis Paramètres, Mettre en pause et Se déconnecter dans cet ordre.
- **ET-3** — `Se déconnecter` appelle le service de session de SPEC-202, invalide les données de session côté client, puis redirige vers `/connexion` sans conserver une page connectée dans l’historique.
- **ET-4** — Les entrées et réponses sont validées par les schémas partagés de `packages/contracts` ; les mutations passent par `packages/services`, utilisent la session utilisateur et ne dépendent pas d’un état client faisant autorité. Les chaînes visibles sont centralisées dans `apps/web/messages/fr.ts`.
- **ET-5** — Chaque composant interactif possède un nom accessible, un focus visible et un `data-testid` stable ; les données asynchrones ont chargement, vide et erreur avec réessai. Les dates sont formatées dans le fuseau de l’utilisateur avec l’horloge injectable.

## 7. Comportements attendus et cas limites

- **CL-1** — Prénom absent : afficher l’adresse abrégée sans exposer l’adresse complète dans le bouton.
- **CL-2** — Déconnexion échouée : afficher une erreur et ne pas annoncer la session fermée.
- **CL-3** — Menu ouvert puis route changée : fermer le panneau et rendre le focus au nouveau contenu.
- **CL-4** — Sous 900 px : le bouton de menu reste visible et les actions conservent un nom accessible.

## 8. Instructions d'implémentation

1. Lire les contrats des dépendances et la maquette ; relever les régions, textes, états et interactions exacts avant d’écrire les composants. Préserver les composants `@learny/ui` déjà livrés.
2. Définir les DTO et services nécessaires, puis écrire `apps/web/components/shell/header.tsx` avec les comportements EF et les cas limites CL. Les données ne sont accessibles qu’au propriétaire ou au membre autorisé selon RLS.
3. Ajouter les états chargement, vide et erreur, le responsive, le clavier, le focus et les messages français ; brancher la page ou la coquille sur les routes existantes. Commits atomiques `feat(SPEC-305): …`.
4. Écrire les tests unitaires, d’intégration et navigateur de la section 12, avec leurs étiquettes, capture et vidéo. Commit `test(SPEC-305): …`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-305`, consigner les preuves observées dans `evidence/SPEC-305/acceptance.md`, corriger jusqu’au vert puis exécuter `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/components/shell/header.tsx`, `apps/web/components/shell/account-menu.tsx`, `apps/web/components/shell/header.test.tsx`, `apps/web/e2e/specs/p3/spec-305.spec.ts`, `apps/web/test/integration/logout-menu.test.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `apps/web/components/shell/app-shell.tsx` ou la route liée à SCR-03 (Accueil, route `/accueil` (`/` redirige), maquette `Main.dc.html`), exports de `packages/contracts/src/index.ts` si un DTO est ajouté.
- **Lus / réutilisés** : `@learny/ui`, services et routes des dépendances, `docs/product/screens.md`, maquette de la section 10 ; dépendances SPEC-304.

## 10. Interface et conformité visuelle

Mode `mockup`. SCR-03, `design/maquettes/Main.dc.html` : en-tête collant translucide et flouté, recherche, cloche avec pastille, avatar et menu « Mon compte ». Capturer menu fermé et ouvert ; vérifier alignement et ordre à 1440×900, repli à 390×844. Les états chargement, vide, erreur et réussite doivent être représentés ; tous les contrôles ont un libellé et un ordre de tabulation cohérent. Vérifier `expectTokens`, les régions et textes attendus, la comparaison à la référence si une maquette s’applique (écart ≤ 12 %), puis `toHaveScreenshot` avec `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — À 1440 px, l’en-tête reste visible après défilement et présente recherche, cloche et Mon compte dans l’ordre de la maquette.
- **CA-2** — Le menu Mon compte affiche identité et nombre actif corrects ; Échap et clic extérieur le ferment et rendent le focus au bouton.
- **CA-3** — Se déconnecter ferme la session, redirige vers `/connexion` et une requête protégée suivante est refusée.
- **CA-4** — À 390 px, les quatre actions ont un nom accessible et aucun contrôle n’est coupé.
- **CA-5** — Captures menu fermé/ouvert conformes (≤ 12 %), axe sans violation serious/critical et vidéo du parcours conservée.

## 12. Plan de tests

- **Unitaires** — `apps/web/components/shell/header.test.tsx`, `describe('[SPEC-305] Coquille : en-tête figé et menu Mon compte')` : menu Mon compte au clavier et retour du focus ; données vides, limites et accessibilité des contrôles (CA-1 à CA-3).
- **Intégration** — `apps/web/test/integration/logout-menu.test.ts`, `describe('[SPEC-305] Coquille : en-tête figé et menu Mon compte service')` : déconnexion puis redirection vers Connexion, RLS avec deux utilisateurs et réponse d’erreur sûre (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p3/spec-305.spec.ts`, `test('Coquille : en-tête figé et menu Mon compte @SPEC-305')` : en-tête collant et rendu mobile, vérifier les textes et l’URL, capturer l’état final et conserver la vidéo (CA-1, CA-4, CA-5).
- **Visuel** — `test('Coquille : en-tête figé et menu Mon compte @SPEC-305 @visual')` : jetons, structure, axe, capture desktop 1440×900 et mobile 390×844 ; comparaison de maquette si applicable (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-304]` / `@SPEC-304`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration ; e2e |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-305/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-305`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Les comportements, bornes et textes de la section 5 sont observés ; l’accès d’un autre utilisateur ne révèle pas ces données.

## 15. Décisions et hypothèses

Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
