---
id: SPEC-307
title: "Recherche globale : interface"
phase: P3
priority: V1
depends_on: [SPEC-305, SPEC-212]
business_rules: [BR-NAV-05]
screens: [SCR-18]
adrs: [ADR-0276]
visual: tokens
---

# SPEC-307 — Recherche globale : interface

## 1. Objectif

Champ de recherche de l'en-tête avec liste de résultats (combobox ARIA, clavier), page /recherche complète, états vide et aucun résultat. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` pour BR-NAV-05, `docs/product/screens.md` pour SCR-18 (Résultats de recherche, route `/recherche?q=`, maquette *aucune* (le panneau d'en-tête suit la maquette du panneau notifications)), `docs/architecture/overview.md` §3–§4, `docs/architecture/api.md`, `docs/engineering/conventions.md` §4–§9 et `docs/engineering/testing.md` §1–§7. Le contenu et les états de la maquette citée en section 10 font foi, sans modification de `design/maquettes/`.

## 3. Dépendances

- **SPEC-305** — Coquille : en-tête figé et menu Mon compte.
- **SPEC-212** — Recherche globale (service et API).
- Les contrats Zod et services existants restent la source des DTO ; aucune donnée d’un autre utilisateur n’est chargée dans la coquille. Les tests utilisent `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` et `LLM_MODE=mock`.

## 4. Règles métier couvertes

- **BR-NAV-05** — Recherche globale (≥ 2 caractères, insensible à la casse et aux accents) sur les notions, chapitres de cours et formations de l'utilisateur ; résultats groupés, navigation clavier, page de résultats complète.

## 5. Exigences fonctionnelles

- **EF-1** — La recherche de l’en-tête ne lance aucune requête sous deux caractères ; à partir de deux, elle utilise le service SPEC-212, insensible à la casse et aux accents, avec résultats groupés Notions, Chapitres et Formations.
- **EF-2** — La liste de suggestions est une combobox : flèches changent l’option active, Entrée ouvre son lien, Échap ferme la liste, Tab poursuit l’ordre normal. Les extraits surlignés restent du texte sûr.
- **EF-3** — La page `/recherche?q=` montre la requête, le total, les groupes et chaque résultat avec titre, type, extrait et lien profond. Une recherche directe par URL donne le même résultat que la saisie.
- **EF-4** — Le champ garde la saisie pendant le chargement et un échec réseau ; une réponse d’une ancienne requête ne remplace jamais une réponse plus récente.
- **EF-5** — Moins de deux caractères, aucun résultat et erreur ont trois états distincts et des textes français explicites.

## 6. Exigences techniques

- **ET-1** — Le champ d’en-tête interroge `GET /api/v1/search?q=` de SPEC-212 seulement après deux caractères normalisés. Un changement de requête annule la requête précédente ; une réponse tardive ne remplace pas les résultats récents.
- **ET-2** — La liste est une combobox ARIA : `aria-expanded`, `aria-controls`, `aria-activedescendant`, flèches Haut/Bas, Entrée et Échap. Les résultats sont groupés Notions, Chapitres et Formations et gardent les URL validées du service.
- **ET-3** — `/recherche?q=` rend la même requête côté serveur, avec résumé du nombre de résultats par catégorie et liens profonds. Les extraits surlignés ne sont jamais injectés en HTML brut.
- **ET-4** — Les entrées et réponses sont validées par les schémas partagés de `packages/contracts` ; les mutations passent par `packages/services`, utilisent la session utilisateur et ne dépendent pas d’un état client faisant autorité. Les chaînes visibles sont centralisées dans `apps/web/messages/fr.ts`.
- **ET-5** — Chaque composant interactif possède un nom accessible, un focus visible et un `data-testid` stable ; les données asynchrones ont chargement, vide et erreur avec réessai. Les dates sont formatées dans le fuseau de l’utilisateur avec l’horloge injectable.

## 7. Comportements attendus et cas limites

- **CL-1** — Moins de deux caractères : aucune requête, invitation à préciser la recherche.
- **CL-2** — Aucun résultat : message explicite et requête conservée.
- **CL-3** — Réseau lent ou hors ligne : chargement, erreur et Réessayer sans résultat périmé.
- **CL-4** — Résultat devenu inaccessible : le service filtre par propriétaire et la navigation refuse l’accès.

## 8. Instructions d'implémentation

1. Lire les contrats des dépendances et la maquette ; relever les régions, textes, états et interactions exacts avant d’écrire les composants. Préserver les composants `@learny/ui` déjà livrés.
2. Définir les DTO et services nécessaires, puis écrire `apps/web/components/search/global-search.tsx` avec les comportements EF et les cas limites CL. Les données ne sont accessibles qu’au propriétaire ou au membre autorisé selon RLS.
3. Ajouter les états chargement, vide et erreur, le responsive, le clavier, le focus et les messages français ; brancher la page ou la coquille sur les routes existantes. Commits atomiques `feat(SPEC-307): …`.
4. Écrire les tests unitaires, d’intégration et navigateur de la section 12, avec leurs étiquettes, capture et vidéo. Commit `test(SPEC-307): …`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-307`, consigner les preuves observées dans `evidence/SPEC-307/acceptance.md`, corriger jusqu’au vert puis exécuter `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/components/search/global-search.tsx`, `apps/web/app/recherche/page.tsx`, `apps/web/app/recherche/loading.tsx`, `apps/web/components/search/search-results.tsx`, `apps/web/components/search/global-search.test.tsx`, `apps/web/e2e/specs/p3/spec-307.spec.ts`, `apps/web/test/integration/search-ui.test.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `apps/web/components/shell/app-shell.tsx` ou la route liée à SCR-18 (Résultats de recherche, route `/recherche?q=`, maquette *aucune* (le panneau d'en-tête suit la maquette du panneau notifications)), exports de `packages/contracts/src/index.ts` si un DTO est ajouté.
- **Lus / réutilisés** : `@learny/ui`, services et routes des dépendances, `docs/product/screens.md`, maquette de la section 10 ; dépendances SPEC-305, SPEC-212.

## 10. Interface et conformité visuelle

Mode `tokens`. SCR-18 est sans maquette : composer avec les jetons et motifs de `docs/product/screens.md` §3. Le panneau d’en-tête reprend largeur, ombre et rayon du panneau de notifications. Page : sur-titre, titre « Résultats de recherche », requête, groupes de cartes et états vides ; tests de jetons et capture de non-régression. Les états chargement, vide, erreur et réussite doivent être représentés ; tous les contrôles ont un libellé et un ordre de tabulation cohérent. Vérifier `expectTokens`, les régions et textes attendus, la comparaison à la référence si une maquette s’applique (écart ≤ 12 %), puis `toHaveScreenshot` avec `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — Pour une requête de deux caractères, résultats groupés et liens de SPEC-212 apparaissent ; pour un seul caractère, aucune requête API n’est envoyée.
- **CA-2** — La navigation Haut/Bas/Entrée/Échap suit le motif combobox ARIA et ouvre le résultat actif.
- **CA-3** — Une recherche accentuée et sa version sans accent produisent le même jeu de résultats autorisés ; aucun contenu d’un autre utilisateur n’apparaît.
- **CA-4** — Une réponse réseau retardée ne remplace pas les résultats de la dernière requête ; les états vide/erreur restent utilisables.
- **CA-5** — La page sans maquette respecte les jetons de `screens.md` §3, passe axe et la capture de non-régression ≤ 1 % avec vidéo.

## 12. Plan de tests

- **Unitaires** — `apps/web/components/search/global-search.test.tsx`, `describe('[SPEC-307] Recherche globale : interface')` : saisie accentuée et résultat regroupé au clavier ; données vides, limites et accessibilité des contrôles (CA-1 à CA-3).
- **Intégration** — `apps/web/test/integration/search-ui.test.ts`, `describe('[SPEC-307] Recherche globale : interface service')` : page complète et lien profond, RLS avec deux utilisateurs et réponse d’erreur sûre (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p3/spec-307.spec.ts`, `test('Recherche globale : interface @SPEC-307')` : moins de deux caractères, aucun résultat et erreur, vérifier les textes et l’URL, capturer l’état final et conserver la vidéo (CA-1, CA-4, CA-5).
- **Visuel** — `test('Recherche globale : interface @SPEC-307 @visual')` : jetons, structure, axe, capture desktop 1440×900 et mobile 390×844 ; comparaison de maquette si applicable (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-305]` / `@SPEC-305`, `[SPEC-212]` / `@SPEC-212`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration ; e2e |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-307/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-307`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Les comportements, bornes et textes de la section 5 sont observés ; l’accès d’un autre utilisateur ne révèle pas ces données.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0276 (combobox non modal ancré sous le champ avec les jetons du panneau de notifications, requête après deux caractères normalisés avec annulation et garde de séquence, page `/recherche` rendue côté serveur par le service SPEC-212 sous la session et la RLS, extraits en texte sûr). Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
