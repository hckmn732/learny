---
id: SPEC-802
title: Responsive et mobile
phase: P8
priority: V1
depends_on: [SPEC-618, SPEC-725, SPEC-724, SPEC-616]
business_rules: [BR-PLA-02, BR-NAV-03]
screens: [SCR-03, SCR-07, SCR-10, SCR-12]
adrs: [ADR-0201, ADR-0034]
visual: mockup   # mockup (écran maquetté) | tokens (écran sans maquette) | demo (page de démonstration SDD)
---

# SPEC-802 — Responsive et mobile

## 1. Objectif

Garantir que **tous** les écrans de Learny sont utilisables de 360 px à 1920 px de large, avec des cibles tactiles d'au moins 44 px, un menu latéral en surimpression sous 900 px, des tableaux qui défilent dans leur conteneur et des panneaux (tuteur, notifications, recherche, Mon compte) affichés en plein écran sur mobile ; prouver cette conformité par une matrice automatisée écrans × largeurs et par la comparaison aux références mobiles 390×844.

## 2. Contexte

- Toutes les fonctionnalités V1 à écran sont livrées (P6, P7). Cette spécification est une **revue transverse** : elle corrige les écrans existants sans changer leur comportement fonctionnel.
- Références : `docs/product/screens.md` (inventaire SCR-01 à SCR-20 et routes), `design/maquettes/*.dc.html` (les maquettes n'ont pas de requêtes média : leur colonne latérale passe au-dessus du contenu sur petit écran ; leur état « menu masqué » s'obtient par le bouton « Masquer le menu »), `design/references/manifest.json` (SPEC-005), `docs/engineering/testing.md` §4 et §6, ADR-0034 (échelle 90 %, jetons en rem).
- Décisions normatives de points de rupture et de dispositions : **ADR-0201** (créé par cette spécification).

## 3. Dépendances

- **SPEC-618** : sélecteur « Changer de formation » et dialogues pause/limite (dialogues à rendre plein écran sur mobile).
- **SPEC-725** : bloc Abonnement des Paramètres (dernier ajout à l'écran Paramètres).
- **SPEC-724** : pages `/formations/[fid]/groupe` et `/invitation/[code]` (tableau des membres).
- **SPEC-616** : carte des notions (SVG plein écran, panneau de détail) — dernier écran complexe livré.
- Transitivement : SPEC-304 (menu latéral, masquage persisté, surimpression), SPEC-305 (en-tête), SPEC-306 (panneau des notifications), SPEC-307 (recherche), SPEC-610 (panneau tuteur), SPEC-005 (script de références et manifeste), SPEC-004 (projets Playwright `desktop` 1440×900 et `mobile` 390×844, helper `compareWithReference`), SPEC-115 (jeu de démonstration).
- Aucune dépendance externe.

## 4. Règles métier couvertes

- **BR-PLA-02** — Utilisable de 360 px à 1920 px de large, cibles tactiles ≥ 44 px : matrice EF-1 sur 6 largeurs (360, 390, 768, 1024, 1440, 1920), contrôle automatique d'absence de défilement horizontal de la page, contrôle automatique de la taille des cibles (ET-4), corrections par écran (EF-3 à EF-8).
- **BR-NAV-03** — Menu masquable et mémorisé ; sous 900 px masqué par défaut et ouvert en surimpression : vérifié et complété (EF-2) : surimpression modale avec voile, piège de focus, fermeture par Échap, clic sur le voile ou navigation ; la préférence mémorisée (profil + `localStorage`, SPEC-304) ne s'applique qu'à partir de 900 px.

## 5. Exigences fonctionnelles

- **EF-1 — Matrice.** Chaque route de `docs/product/screens.md` (SCR-01 à SCR-20, avec les états listés en ET-3) est rendue sans défilement horizontal de la page (`document.documentElement.scrollWidth ≤ window.innerWidth`) aux largeurs 360, 390, 768, 1024, 1440 et 1920 px (hauteurs : 740, 844, 1024, 768, 900, 1080). Aucun texte n'est tronqué sans moyen d'accès (ellipse uniquement avec `title` ou contenu complet accessible).
- **EF-2 — Menu latéral.** < 900 px : masqué au chargement, bouton « Afficher le menu » dans l'en-tête ; ouvert, il s'affiche en surimpression à gauche (largeur `min(85vw, 18rem)`), au-dessus d'un voile `rgba(17,17,19,0.48)`, `role="dialog"` `aria-modal="true"` `aria-label="Menu principal"`, focus placé sur le premier lien, piégé, rendu au bouton d'ouverture à la fermeture (Échap, clic sur le voile, bouton « Masquer le menu », clic sur un lien). ≥ 900 px : comportement de SPEC-304 inchangé (menu en colonne, masquage mémorisé). Le passage de 899 à 900 px (rotation, redimensionnement) ferme la surimpression sans perdre la préférence mémorisée.
- **EF-3 — Panneaux plein écran.** < 768 px, le panneau des notifications, le panneau de résultats de recherche de l'en-tête, le menu Mon compte, le panneau du tuteur (Cours) et le panneau de détail de la carte des notions s'affichent en plein écran (`position: fixed; inset: 0`), avec un en-tête contenant le titre du panneau et un bouton « Fermer » (icône X, nom accessible « Fermer ») de 44 × 44 px ; le défilement du document est bloqué pendant l'ouverture (`overflow: hidden` sur `body`). ≥ 768 px : dispositions de SPEC-306, 307, 305, 610 et 616 inchangées (panneau tuteur latéral décalant le contenu ≥ 1280 px, superposé de 768 à 1279 px).
- **EF-4 — Tableaux.** Tout tableau de données (tableau des formations de l'accueil, tableaux des cours, tableau de production de l'exercice, revue de l'examen blanc, membres du groupe, journal des automatismes, consommation IA) est enveloppé dans un conteneur `overflow-x: auto` avec `role="region"`, `aria-label` = légende du tableau, `tabindex="0"` (défilable au clavier), largeur minimale du tableau conservée ; le tableau des formations de l'accueil passe < 768 px en **liste de cartes** (une carte par formation reprenant titre, objectif, progression, module en cours, prochaine activité, fin prévue, action) comme le fait la maquette lorsque ses colonnes se replient.
- **EF-5 — Agenda (SCR-12).** < 768 px : la vue par défaut ouverte depuis le menu devient « Jour » (le paramètre d'URL `vue` explicite reste prioritaire) ; la vue Semaine défile horizontalement dans sa grille avec la colonne des heures figée ; le mini-calendrier passe sous la vue ; le détail d'une activité s'ouvre en feuille basse plein largeur.
- **EF-6 — Quiz global, quiz, examen, exercice (SCR-08 à SCR-11).** < 768 px : le rail des jeux devient une liste horizontale défilante au-dessus de la question (étape courante centrée), les boutons d'action principaux (« Vérifier », « Suivant », « Passer », « Terminer ») sont fixés en bas de l'écran dans une barre de 72 px avec marge de sécurité (`env(safe-area-inset-bottom)`), les jeux d'association et de classement passent en une colonne, la palette de l'examen blanc s'ouvre en feuille basse.
- **EF-7 — Carte des notions (SCR-14).** < 768 px : la toile occupe toute la largeur sous l'en-tête, les contrôles de zoom (+, −, recentrer) font 44 px, le glisser à un doigt déplace la vue et le pincement zoome ; la liste « À consolider » et le mode d'emploi passent sous la toile.
- **EF-8 — Cibles tactiles.** Tout élément interactif mesure au moins 44 × 44 px CSS (zone cliquable, éventuellement étendue par un pseudo-élément `::before` positionné en `inset: -N px`) à toutes les largeurs. Exceptions limitatives (ADR-0201) : liens en ligne dans un paragraphe de texte courant (exception « en ligne » de WCAG 2.5.8) et nœuds SVG de la carte des notions (alternative : recherche et liste « À consolider », EF-7). Chaque exception porte `data-touch-exempt="inline"` ou `data-touch-exempt="graph-node"`.
- **EF-9 — Saisie mobile.** Les champs utilisent le bon `type`/`inputmode` (`email`, `numeric` pour les heures, `search`), `autocomplete` adapté (`email`, `current-password`, `new-password`, `given-name`, `family-name`) et une taille de police calculée ≥ 16 px sur mobile pour éviter le zoom automatique d'iOS.

## 6. Exigences techniques

- **ET-1 — Points de rupture** (ADR-0201), déclarés une seule fois dans `@learny/ui/tokens` et le thème Tailwind 4 : `sm` = 48rem (768 px), `nav` = 56.25rem (900 px), `lg` = 64rem (1024 px), `xl` = 80rem (1280 px), `2xl` = 90rem (1440 px). Tailles en px CSS **de la fenêtre** (les requêtes média ne sont pas affectées par `html { font-size: 90% }` car elles sont exprimées en `em` du navigateur ; convertir en rem de 16 px). Aucun autre point de rupture n'est autorisé (règle ESLint/Stylelint ou test qui recherche les valeurs `min-width`/`max-width` arbitraires dans `apps/web` et `packages/ui`).
- **ET-2 — Composants.** Ajouter à `@learny/ui` : `ResponsivePanel` (panneau latéral ≥ `sm`, plein écran < `sm`, Radix Dialog), `ScrollableTable` (EF-4), `BottomActionBar` (EF-6), `BottomSheet` (EF-5, EF-6) ; les écrans concernés les adoptent. Hook `useBreakpoint()` basé sur `matchMedia` (rendu serveur : valeur `desktop`, puis correction après hydratation sans décalage de mise en page grâce au CSS qui porte la disposition ; le hook ne sert qu'au comportement).
- **ET-3 — Inventaire des états testés** (`apps/web/e2e/support/responsive-matrix.ts`, exporté) : SCR-01 (inscription, connexion), SCR-02 (5 étapes), SCR-03 (accueil, menu ouvert, notifications ouvertes, Mon compte ouvert), SCR-04, SCR-05 (proposé, en cours), SCR-06, SCR-07 (cours, panneau tuteur ouvert), SCR-08, SCR-09 (question, résultat), SCR-10 (carte de rappel, association), SCR-11 (introduction, épreuve, résultats), SCR-12 (jour, semaine, mois), SCR-13, SCR-14 (carte, détail ouvert), SCR-15 (4 onglets), SCR-16, SCR-17 (groupe, invitation), SCR-18, SCR-19 (CGU si déjà livrée par SPEC-806, sinon ignorée par l'inventaire tant que la route renvoie 404), SCR-20 (not-found, `/hors-ligne`). Chaque entrée : `{ id, route, setup?: (page) => Promise<void>, user: 'demo' | 'anonymous' }`.
- **ET-4 — Contrôle des cibles** (`packages/testing/src/touch-targets.ts`) : `expectTouchTargets(page, { min: 44 })` parcourt `a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab], [role=checkbox], [role=radio], [role=menuitem], [tabindex="0"]` visibles, ignore `[data-touch-exempt]`, mesure la boîte englobante **augmentée** de la zone du pseudo-élément (`getComputedStyle(el, '::before')` positionné) et échoue en listant sélecteur, texte et dimensions des fautifs. Contrôle du défilement horizontal : `expectNoHorizontalScroll(page)`.
- **ET-5 — Références mobiles.** Le script de SPEC-005 (`design/references/` + manifeste) est **complété** par l'état `menu-masque` en 390×844 pour `Main`, `Cours`, `QuizGlobal` et `Agenda` (clic sur le bouton « Masquer le menu » de la maquette, sans modifier la maquette, horloge figée ADR-0047). Seules ces quatre références sont ajoutées ; les autres ne sont pas régénérées. Le manifeste reçoit les entrées `{ screen, state: 'menu-masque', viewport: 'mobile', file }`.
- **ET-6 — Performance.** Aucune image ou bibliothèque supplémentaire pour le responsive ; les dispositions sont en CSS (pas de rendu conditionnel serveur/client qui provoquerait du CLS ; CLS < 0,1 vérifié par SPEC-804).

## 7. Comportements attendus et cas limites

- **CL-1 — Rotation d'un téléphone (390 → 844 px de large).** Pas de rechargement ; la surimpression du menu se ferme si la largeur passe ≥ 900 px ; un panneau plein écran devient latéral sans perdre son contenu (discussion du tuteur conservée).
- **CL-2 — Préférence « menu masqué » mémorisée puis passage sous 900 px.** Le menu reste masqué (défaut mobile) ; revenir ≥ 900 px rétablit la préférence mémorisée (masqué ou affiché), qui n'est jamais écrasée par l'état mobile.
- **CL-3 — Texte agrandi à 200 % (zoom navigateur) à 1280 px.** Équivalent à 640 px CSS : disposition mobile, aucune perte de contenu ni défilement horizontal (WCAG 1.4.10 Redisposition, vérifié par la largeur 360 de la matrice).
- **CL-4 — Clavier virtuel ouvert (champ de discussion du tuteur, champ de recherche).** Le champ reste visible (`scrollIntoView({ block: 'nearest' })` au focus) et la barre d'actions fixe (EF-6) se masque quand un champ texte a le focus sur mobile.
- **CL-5 — Très long titre de formation ou de notion (120 caractères).** Retour à la ligne (`overflow-wrap: anywhere`), jamais de débordement ; la carte formation du menu limite à 2 lignes avec ellipse et `title`.
- **CL-6 — Écran 1920 px.** Le contenu principal est limité à `max-width: 90rem` centré (comme les maquettes à 1440) ; pas d'étirement des cartes au-delà.
- **CL-7 — Examen blanc sur mobile.** Le chronomètre reste visible en permanence (barre fixe en haut) ; le passage orange sous 5 min (BR-PRA-03) est conservé.
- **CL-8 — Double clic rapide sur « Afficher le menu ».** Une seule surimpression ; le second clic est ignoré pendant l'animation (ou l'animation est absente si `prefers-reduced-motion: reduce`).
- **CL-9 — Pointeur fin sur grand écran tactile (1024 px tactile).** Les cibles gardent 44 px ; aucune dépendance au survol pour accéder à une action (toute action visible au survol est aussi accessible au focus et au toucher).
- **CL-10 — Tableau défilant atteint au clavier.** `Tab` met le focus sur la région ; les flèches gauche/droite la font défiler ; le focus est visible.

## 8. Instructions d'implémentation

1. Ajouter les points de rupture d'ET-1 aux jetons et au thème Tailwind ; ajouter le test qui interdit les autres valeurs. Commit `feat(SPEC-802): fixe les points de rupture`.
2. Créer `expectTouchTargets`, `expectNoHorizontalScroll` dans `@learny/testing` et l'inventaire `responsive-matrix.ts`. Commit `test(SPEC-802): ajoute les contrôles de mise en page mobile`.
3. Lancer la matrice (`pnpm test:e2e --grep @SPEC-802`) pour obtenir la liste initiale des fautes ; la consigner dans `evidence/SPEC-802/screenshots/` (rapport `matrix-before.json`).
4. Créer `ResponsivePanel`, `ScrollableTable`, `BottomActionBar`, `BottomSheet`, `useBreakpoint` dans `@learny/ui` avec leurs tests et leur entrée dans la galerie `/_dev/ui`. Commit `feat(SPEC-802): ajoute les composants de disposition mobile`.
5. Corriger la coquille : surimpression du menu (EF-2), panneaux notifications/recherche/Mon compte (EF-3). Commit `fix(SPEC-802): adapte la coquille au mobile`.
6. Corriger écran par écran dans l'ordre SCR-03, 07, 10, 12, puis SCR-01, 02, 04, 05, 06, 08, 09, 11, 13, 14, 15, 16, 17, 18, 19, 20 (un commit `fix(SPEC-802): adapte <écran> au mobile` par écran ou groupe cohérent).
7. Compléter le script de SPEC-005 (ET-5), générer les 4 références `menu-masque` mobiles, mettre à jour le manifeste. Commit `build(SPEC-802): ajoute les références mobiles menu masqué`.
8. Mettre à jour les lignes de base `toHaveScreenshot` mobiles modifiées (justification par écran dans `evidence/SPEC-802/summary.md`). Commit `test(SPEC-802): met à jour les lignes de base mobiles`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ui/src/components/{ResponsivePanel,ScrollableTable,BottomActionBar,BottomSheet}.tsx` et tests, `packages/ui/src/hooks/use-breakpoint.ts`, `packages/testing/src/touch-targets.ts`, `apps/web/e2e/support/responsive-matrix.ts`, `apps/web/e2e/specs/p8/responsive-matrix.spec.ts`, `apps/web/e2e/specs/p8/responsive-visual.spec.ts`, `apps/web/e2e/specs/p8/mobile-navigation.spec.ts`, 4 références `design/references/*-menu-masque-mobile.png` (noms exacts selon la convention du manifeste SPEC-005).
- **Modifiés** : jetons et thème (`packages/ui/src/tokens/*`), menu latéral et en-tête (SPEC-304/305), panneaux (SPEC-306/307/610/616), écrans listés à l'étape 6, script de références de SPEC-005 et `design/references/manifest.json`, `apps/web/e2e/__screenshots__/` (lignes de base mobiles).
- **Lus / réutilisés** : `compareWithReference`, `expectTokens`, helper axe (`@learny/testing`), jeu de démonstration SPEC-115.

## 10. Interface et conformité visuelle

- Écrans de référence : SCR-03 `Main.dc.html`, SCR-07 `Cours.dc.html`, SCR-10 `QuizGlobal.dc.html`, SCR-12 `Agenda.dc.html`, état `menu-masque`, viewport mobile 390×844 (ET-5), plus les références desktop existantes (non-régression).
- Structure mobile vérifiée (390 px) : en-tête figé (bouton « Afficher le menu », recherche réduite à une icône ouvrant le panneau plein écran, cloche, avatar) ; contenu principal en une colonne ; pour SCR-03 l'ordre des blocs est : date et titre, « Nouvelle formation », Votre journée, rétention, quiz global du jour, Mes formations (cartes) ; pour SCR-07 : fil d'Ariane, en-tête du chapitre, sommaire repliable (`<details>` « Sommaire »), sections ; pour SCR-10 : en-tête de session, rail défilant, jeu, barre d'actions fixe ; pour SCR-12 : sélecteur de vue, navigation, vue Jour, totaux, mini-calendrier.
- Contrôles automatisés : (1) `expectTokens` sur l'en-tête, le menu en surimpression (fond `#111113`), le voile, les boutons (citron/noir) à 390 px ; (2) structure ci-dessus ; (3) `compareWithReference` (`main` + en-tête, page complète, horloge figée au 2026-11-11T12:20:00Z, seed SPEC-115, menu masqué) pour SCR-03, SCR-07, SCR-10, SCR-12 en 390×844 : écart ≤ 12 % ; (4) lignes de base `toHaveScreenshot` (`maxDiffPixelRatio: 0.01`) en 360, 390 et 768 px pour tous les états de la matrice.
- États : chargement (squelettes de même hauteur que le contenu final), vide, erreur — vérifiés à 360 px sur l'accueil et l'agenda.

## 11. Critères d'acceptation

- **CA-1** — Pour les 6 largeurs et tous les états de l'inventaire ET-3, `expectNoHorizontalScroll` réussit (0 échec sur la matrice complète).
- **CA-2** — `expectTouchTargets(44)` réussit sur tous les états de l'inventaire à 390 px et à 1024 px ; les exemptions présentes sont uniquement `inline` et `graph-node`.
- **CA-3** — À 390 px, le menu est masqué au chargement, s'ouvre en surimpression `role="dialog"` avec focus piégé et se ferme par Échap en rendant le focus au bouton d'ouverture ; à 1440 px, la préférence mémorisée est respectée après rechargement.
- **CA-4** — À 390 px, les panneaux notifications, recherche, Mon compte, tuteur et détail de carte occupent 100 % de la fenêtre et possèdent un bouton « Fermer » de 44 × 44 px.
- **CA-5** — Les tableaux de l'inventaire sont dans une région défilante focusable ; le tableau des formations de l'accueil est rendu en cartes sous 768 px.
- **CA-6** — Comparaison aux références mobiles « menu masqué » de SCR-03, SCR-07, SCR-10 et SCR-12 : écart ≤ 12 % pour chacune (taux consignés).
- **CA-7** — Aucune violation axe serious/critical à 390 px sur les états de l'inventaire.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-802] …')`) :
  - `packages/ui/src/components/ResponsivePanel.test.tsx` : rendu plein écran sous `sm` (matchMedia simulé), bouton « Fermer », focus rendu.
  - `packages/ui/src/components/ScrollableTable.test.tsx` : `role="region"`, `aria-label`, `tabindex`.
  - `packages/ui/src/hooks/use-breakpoint.test.ts` : valeurs aux bornes 767/768/899/900/1023/1024.
  - `packages/ui/src/tokens/breakpoints.test.ts` : valeurs d'ET-1 et absence de point de rupture arbitraire dans les sources (analyse statique).
  - `packages/testing/src/touch-targets.test.ts` : détection d'un bouton de 32 px, prise en compte du pseudo-élément, exemptions.
- **Intégration** (`[SPEC-802]`) :
  - `packages/ui/test/integration/sidebar-overlay.test.tsx` (jsdom + Testing Library) : préférence mémorisée non écrasée par l'état mobile (CL-2), fermeture au franchissement de 900 px (CL-1).
  - `tools/references/test/integration/menu-masque.test.ts` (ou chemin du script de SPEC-005) : le manifeste contient les 4 nouvelles entrées et les fichiers existent avec les dimensions 390×844 (× facteur de densité défini par SPEC-005).
- **End-to-end** (`@SPEC-802`, vidéo) :
  - `responsive-matrix.spec.ts` : un test par largeur (`matrice 360 px @SPEC-802` … `matrice 1920 px @SPEC-802`) qui parcourt l'inventaire, appelle `expectNoHorizontalScroll` et, à 390/1024, `expectTouchTargets`, plus axe à 390 px.
  - `mobile-navigation.spec.ts` (projet `mobile`) : `menu en surimpression et panneaux plein écran @SPEC-802` — ouvrir/fermer le menu (Échap, voile, lien), ouvrir notifications → plein écran → Fermer, ouvrir le tuteur depuis le cours → plein écran → envoyer une question (fixture mock) → Fermer, ouvrir le détail d'une notion de la carte ; `agenda et quiz global sur mobile @SPEC-802` — vue Jour par défaut, feuille basse du détail, rail défilant et barre d'actions fixe du quiz global.
- **Visuel** (`@SPEC-802 @visual`, `responsive-visual.spec.ts`) : `compareWithReference` pour SCR-03, 07, 10, 12 (390×844, menu masqué, ≤ 12 %) ; `expectTokens` et structure ; `toHaveScreenshot` 360/390/768.
- **Non-régression** : rejouer `@SPEC-304`, `@SPEC-305`, `@SPEC-306`, `@SPEC-307`, `@SPEC-603`, `@SPEC-609`, `@SPEC-610`, `@SPEC-616`, `@SPEC-701`, `@SPEC-704`, `@SPEC-707`, `@SPEC-724`, et tous les `@visual` desktop.

| Critère | Tests |
|---|---|
| CA-1 | `responsive-matrix.spec.ts` (6 tests) |
| CA-2 | `responsive-matrix.spec.ts` (390, 1024), `touch-targets.test.ts` |
| CA-3 | `mobile-navigation.spec.ts`, `sidebar-overlay.test.tsx` |
| CA-4 | `mobile-navigation.spec.ts`, `ResponsivePanel.test.tsx` |
| CA-5 | `responsive-matrix.spec.ts`, `ScrollableTable.test.tsx` |
| CA-6 | `responsive-visual.spec.ts` (`@visual`), `menu-masque.test.ts` |
| CA-7 | `responsive-matrix.spec.ts` (axe 390 px) |

## 13. Preuves attendues

- Vidéos : `menu en surimpression et panneaux plein écran`, `agenda et quiz global sur mobile`, `matrice 390 px`.
- `evidence/SPEC-802/screenshots/matrix-before.json` et `matrix-after.json` (fautes par écran et largeur avant/après), captures 360/390/768/1024 de chaque écran principal.
- `evidence/SPEC-802/visual/` : quatre comparaisons côte à côte mobile + diff, avec le taux d'écart dans `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), plus : matrice complète verte (0 faute), lignes de base mobiles mises à jour avec justification, aucune régression des comparaisons desktop existantes, aucun point de rupture hors ET-1.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0034 (échelle et conformité visuelle), ADR-0059 (Radix pour les panneaux), ADR-0036 (carte SVG, interactions impératives), ADR-0047 (horloge).
- **ADR-0201 créé** (« Points de rupture et disposition mobile ») : points de rupture d'ET-1, panneaux plein écran sous 768 px, surimpression du menu sous 900 px, barre d'actions fixe et feuilles basses, exemptions limitatives des cibles tactiles (`inline`, `graph-node`), références mobiles « menu masqué » générées depuis les maquettes, largeurs de la matrice (360, 390, 768, 1024, 1440, 1920).
- Complément signalé : ajout d'un état `menu-masque` mobile au script de références de SPEC-005 (les maquettes ne sont pas modifiées, ADR-0034).
- Hypothèse : les maquettes n'ayant pas de requêtes média, la comparaison mobile ne vise que l'état « menu masqué », seul représentatif de la disposition mobile de l'application.
