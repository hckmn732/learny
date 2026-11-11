---
id: SPEC-304
title: "Coquille : menu latéral"
phase: P3
priority: V1
depends_on: [SPEC-303, SPEC-202]
business_rules: [BR-NAV-02, BR-NAV-03, BR-PRO-04, BR-FOR-11]
screens: [SCR-03]
adrs: [ADR-0075]
visual: mockup
---

# SPEC-304 — Coquille : menu latéral

## 1. Objectif

Menu latéral conforme à la maquette : logo, Accueil, Agenda, séparateur, section Formation en cours (carte, changer de formation, Programme, Carte des notions, Quiz global + badge, Mes lacunes + badge), série (données fournies par une API provisoire puis SPEC-723), masquage persisté (profil + localStorage), responsive < 900 px en surimpression, état actif par route. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` pour BR-NAV-02, BR-NAV-03, BR-PRO-04, BR-FOR-11, `docs/product/screens.md` pour SCR-03 (Accueil, route `/accueil` (`/` redirige), maquette `Main.dc.html`), `docs/architecture/overview.md` §3–§4, `docs/architecture/api.md`, `docs/engineering/conventions.md` §4–§9 et `docs/engineering/testing.md` §1–§7. ADR applicables : ADR-0075. Le contenu et les états de la maquette citée en section 10 font foi, sans modification de `design/maquettes/`.

## 3. Dépendances

- **SPEC-303** — Composants de base II : structure et retours.
- **SPEC-202** — Authentification et sessions.
- Les contrats Zod et services existants restent la source des DTO ; aucune donnée d’un autre utilisateur n’est chargée dans la coquille. Les tests utilisent `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` et `LLM_MODE=mock`.

## 4. Règles métier couvertes

- **BR-NAV-02** — Menu latéral en deux zones : navigation générale (Accueil, Agenda) ; section « Formation en cours » (carte formation, changer de formation, Programme, Carte des notions, Quiz global avec nombre de notions dues, Mes lacunes avec nombre de lacunes) ; série en bas.
- **BR-NAV-03** — Le menu latéral peut être masqué complètement et réaffiché depuis l'en-tête ; le choix est mémorisé sur l'appareil. Sous 900 px de large, il est masqué par défaut et s'ouvre en surimpression.
- **BR-PRO-04** — Carte formation en cours dans le menu : sigle, titre, barre de progression, « Module n sur N ».
- **BR-FOR-11** — La « formation en cours » (affichée dans le menu) est la dernière formation active consultée ; « Changer de formation » ouvre la liste des formations actives et en pause.

## 5. Exigences fonctionnelles

- **EF-1** — Le menu montre, dans cet ordre, logo Learny, liens Accueil et Agenda, séparateur, carte Formation en cours, Changer de formation, Programme, Carte des notions, Quiz global avec nombre de notions dues, Mes lacunes avec nombre de lacunes, puis la série en bas. Les liens pointent vers les routes françaises de la formation courante.
- **EF-2** — La carte de formation affiche sigle, titre, barre d’avancement et « Module n sur N ». La formation courante est la dernière formation active consultée ; Changer de formation liste les actives et celles en pause, sans modifier les données pédagogiques.
- **EF-3** — Le bouton Masquer fait disparaître complètement le menu et mémorise le choix sur cet appareil. Le bouton Afficher le menu de l’en-tête le rouvre. Sous 900 px, le menu est fermé au premier affichage et s’ouvre en surimpression avec voile.
- **EF-4** — Le lien correspondant à la route courante a un état visuel actif et `aria-current="page"`. Les compteurs et la série se rafraîchissent après une activité ; avant SPEC-723, la série provient du DTO provisoire prévu dans le contrat.
- **EF-5** — Sans formation active, la section affiche un état vide et l’action « Nouvelle formation » ; aucun lien de formation sans identifiant n’est rendu.

## 6. Exigences techniques

- **ET-1** — La coquille lit la formation courante depuis `profiles.current_formation_id` et les compteurs depuis un DTO serveur. Une formation inaccessible ou en pause n’est pas rendue comme courante.
- **ET-2** — Le menu utilise `nav` avec `aria-label="Navigation principale"`; les liens actifs portent `aria-current="page"`. La série est lue depuis un DTO provisoire conforme au contrat futur de SPEC-723.
- **ET-3** — L’état `sidebar_collapsed` est persisté dans le profil et reflété dans `localStorage` pour éviter un clignotement au chargement. Sous 900 px, la surimpression n’altère pas la préférence desktop.
- **ET-4** — Les entrées et réponses sont validées par les schémas partagés de `packages/contracts` ; les mutations passent par `packages/services`, utilisent la session utilisateur et ne dépendent pas d’un état client faisant autorité. Les chaînes visibles sont centralisées dans `apps/web/messages/fr.ts`.
- **ET-5** — Chaque composant interactif possède un nom accessible, un focus visible et un `data-testid` stable ; les données asynchrones ont chargement, vide et erreur avec réessai. Les dates sont formatées dans le fuseau de l’utilisateur avec l’horloge injectable.

## 7. Comportements attendus et cas limites

- **CL-1** — Aucune formation active : la section dédiée propose « Nouvelle formation » sans lien cassé.
- **CL-2** — Le navigateur refuse localStorage : la préférence serveur reste utilisable.
- **CL-3** — Surimpression ouverte : Échap, clic sur le voile et navigation ferment le menu et rendent le focus au déclencheur.
- **CL-4** — Formation supprimée ou devenue inaccessible : repli sur la dernière formation active autorisée.

## 8. Instructions d'implémentation

1. Lire les contrats des dépendances et la maquette ; relever les régions, textes, états et interactions exacts avant d’écrire les composants. Préserver les composants `@learny/ui` déjà livrés.
2. Définir les DTO et services nécessaires, puis écrire `apps/web/components/shell/sidebar.tsx` avec les comportements EF et les cas limites CL. Les données ne sont accessibles qu’au propriétaire ou au membre autorisé selon RLS.
3. Ajouter les états chargement, vide et erreur, le responsive, le clavier, le focus et les messages français ; brancher la page ou la coquille sur les routes existantes. Commits atomiques `feat(SPEC-304): …`.
4. Écrire les tests unitaires, d’intégration et navigateur de la section 12, avec leurs étiquettes, capture et vidéo. Commit `test(SPEC-304): …`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-304`, consigner les preuves observées dans `evidence/SPEC-304/acceptance.md`, corriger jusqu’au vert puis exécuter `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/components/shell/sidebar.tsx`, `apps/web/components/shell/app-shell.tsx`, `apps/web/components/shell/sidebar.test.tsx`, `apps/web/app/api/v1/me/sidebar/route.ts`, `packages/contracts/src/sidebar.ts`, `apps/web/e2e/specs/p3/spec-304.spec.ts`, `apps/web/test/integration/sidebar-route.test.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `apps/web/components/shell/app-shell.tsx` ou la route liée à SCR-03 (Accueil, route `/accueil` (`/` redirige), maquette `Main.dc.html`), exports de `packages/contracts/src/index.ts` si un DTO est ajouté.
- **Lus / réutilisés** : `@learny/ui`, services et routes des dépendances, `docs/product/screens.md`, maquette de la section 10 ; dépendances SPEC-303, SPEC-202.

## 10. Interface et conformité visuelle

Mode `mockup`. SCR-03, `design/maquettes/Main.dc.html` : fond sombre `#111113`, largeur 248 px à l’échelle maquette, logo, Accueil, Agenda, séparation, carte « Formation en cours », liens Programme/Carte des notions/Quiz global/Mes lacunes et série en bas. Vérifier l’ordre, les badges, la surimpression mobile et la capture de référence à 1440×900 et 390×844. Les états chargement, vide, erreur et réussite doivent être représentés ; tous les contrôles ont un libellé et un ordre de tabulation cohérent. Vérifier `expectTokens`, les régions et textes attendus, la comparaison à la référence si une maquette s’applique (écart ≤ 12 %), puis `toHaveScreenshot` avec `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — À 1440 px, les dix régions du menu sont dans l’ordre de la maquette et la carte affiche sigle, titre, progression et « Module n sur N » pour la formation active du jeu de démonstration.
- **CA-2** — Après masquage et rechargement, le menu reste masqué ; sous 900 px, il est fermé par défaut, s’ouvre en surimpression et se ferme par Échap avec retour du focus.
- **CA-3** — Les badges Quiz global et Mes lacunes reflètent les compteurs du DTO ; un second utilisateur ne peut pas lire ceux du premier.
- **CA-4** — Sur `/formations/[fid]/programme`, Programme porte `aria-current="page"` ; un autre lien n’est pas marqué actif et la navigation change correctement la route.
- **CA-5** — Captures desktop/mobile comparées à la maquette (écart ≤ 12 %), axe sans violation serious/critical et vidéo du parcours conservée.

## 12. Plan de tests

- **Unitaires** — `apps/web/components/shell/sidebar.test.tsx`, `describe('[SPEC-304] Coquille : menu latéral')` : navigation active et changement de formation ; données vides, limites et accessibilité des contrôles (CA-1 à CA-3).
- **Intégration** — `apps/web/test/integration/sidebar-route.test.ts`, `describe('[SPEC-304] Coquille : menu latéral service')` : masquage persistant et ouverture en surimpression mobile, RLS avec deux utilisateurs et réponse d’erreur sûre (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p3/spec-304.spec.ts`, `test('Coquille : menu latéral @SPEC-304')` : absence de formation et compteurs à zéro, vérifier les textes et l’URL, capturer l’état final et conserver la vidéo (CA-1, CA-4, CA-5).
- **Visuel** — `test('Coquille : menu latéral @SPEC-304 @visual')` : jetons, structure, axe, capture desktop 1440×900 et mobile 390×844 ; comparaison de maquette si applicable (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-303]` / `@SPEC-303`, `[SPEC-202]` / `@SPEC-202`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration ; e2e |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-304/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-304`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Les comportements, bornes et textes de la section 5 sont observés ; l’accès d’un autre utilisateur ne révèle pas ces données.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0075. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
