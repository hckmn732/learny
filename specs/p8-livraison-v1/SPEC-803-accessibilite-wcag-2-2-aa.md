---
id: SPEC-803
title: Accessibilité WCAG 2.2 AA
phase: P8
priority: V1
depends_on: [SPEC-802]
business_rules: [BR-PLA-03]
screens: []
adrs: [ADR-0038, ADR-0204]
visual: tokens   # mockup (écran maquetté) | tokens (écran sans maquette) | demo (page de démonstration SDD)
---

# SPEC-803 — Accessibilité WCAG 2.2 AA

## 1. Objectif

Auditer et corriger l'accessibilité de **toutes** les pages de Learny selon WCAG 2.2 niveau AA : audit axe automatisé de chaque état de page, parcours clavier complets des six parcours critiques (connexion, quiz de validation, examen blanc, quiz global, carte des notions, paramètres), vérification des noms accessibles par instantanés d'arbre d'accessibilité, puis publication d'une déclaration d'accessibilité honnête à la route `/accessibilite`.

## 2. Contexte

- ADR-0038 : WCAG 2.2 AA, primitives Radix UI, axe dans tous les tests e2e, audit clavier par écran au checkpoint CP-8. SPEC-309 a livré le socle (lien d'évitement, gestion du focus des panneaux, `aria-live`, `prefers-reduced-motion`, contrastes des jetons, helper axe). SPEC-802 a rendu les écrans responsives (prérequis de 1.4.10 Redisposition et 2.5.8 Taille de la cible).
- Documents : `docs/product/screens.md` (inventaire), `docs/engineering/conventions.md` §4 (rôles ARIA, focus, `aria-live`), `docs/engineering/testing.md` §1 et §6, inventaire de la matrice responsive `apps/web/e2e/support/responsive-matrix.ts` (SPEC-802), réutilisé ici comme liste exhaustive des états de pages.
- La déclaration d'accessibilité et son lien de pied de page suivent **ADR-0204** (pages publiques de conformité), partagé avec SPEC-806.

## 3. Dépendances

- **SPEC-802** (doit être `done`) : inventaire des états `responsive-matrix.ts`, composants `ResponsivePanel`, `BottomSheet`, contrôles de cibles.
- Transitivement : SPEC-309 (helper axe `expectNoAxeViolations` de `@learny/testing`, lien d'évitement), SPEC-302/303 (composants), tous les écrans P6/P7, SPEC-115 (jeu de démonstration), SPEC-202 (middleware : routes publiques).
- Bibliothèques : `@axe-core/playwright` (déjà présent, ADR-0070), Playwright ≥ 1.50 (`toMatchAriaSnapshot`), `eslint-plugin-jsx-a11y` (déjà présent, règles passées en `error`). Aucune dépendance externe en ligne.

## 4. Règles métier couvertes

- **BR-PLA-03** — WCAG 2.2 AA : navigation clavier complète (parcours EF-3, critère 2.1.1), focus visible (2.4.7, 2.4.11, EF-5), rôles ARIA (4.1.2, instantanés EF-4), contrastes (1.4.3, 1.4.11, ET-4), `prefers-reduced-motion` (EF-6), aucune violation axe serious/critical (EF-1, sur 100 % des états de l'inventaire).

## 5. Exigences fonctionnelles

- **EF-1 — Audit automatisé.** Chaque état de l'inventaire (ET-1) est audité par axe avec les étiquettes `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice` désactivé sauf `region`, `landmark-one-main`, `page-has-heading-one`, `heading-order`. Échec si une violation `serious` ou `critical` ; les violations `moderate` et `minor` sont consignées dans `evidence/SPEC-803/axe-report.json` et corrigées si elles relèvent d'un critère A/AA (aucune exception non justifiée). Desktop 1440×900 et mobile 390×844.
- **EF-2 — Grille critère par critère.** Les critères WCAG 2.2 A et AA ci-dessous sont applicables à Learny et chacun est couvert par une correction et/ou un test (ET-2) : 1.1.1, 1.3.1, 1.3.2, 1.3.3, 1.3.4, 1.3.5, 1.4.1, 1.4.3, 1.4.4, 1.4.5, 1.4.10, 1.4.11, 1.4.12, 1.4.13, 2.1.1, 2.1.2, 2.1.4, 2.2.1, 2.2.2, 2.3.1, 2.4.1, 2.4.2, 2.4.3, 2.4.4, 2.4.5, 2.4.6, 2.4.7, 2.4.11, 2.5.1, 2.5.2, 2.5.3, 2.5.4, 2.5.7, 2.5.8, 3.1.1, 3.1.2, 3.2.1, 3.2.2, 3.2.3, 3.2.4, 3.2.6, 3.3.1, 3.3.2, 3.3.3, 3.3.4, 3.3.7, 3.3.8, 4.1.2, 4.1.3. Non applicables en V1 (aucun média produit par Learny ; contenus déposés par l'apprenant = contenus tiers) : 1.2.1 à 1.2.5, 1.4.2.
- **EF-3 — Parcours clavier.** Six parcours exécutables **sans souris** (seules les touches Tab, Maj+Tab, Entrée, Espace, Échap, flèches) :
  1. *Connexion* : `/connexion` → choisir « Mot de passe » → saisir e-mail et mot de passe → Entrée → arrivée sur `/accueil` avec focus sur le lien d'évitement puis le `h1`.
  2. *Quiz de validation* : depuis le programme, ouvrir le module 3 → « Passer le quiz » → répondre à 3 questions à choix (flèches pour les options, Espace pour cocher, bouton « Vérifier », « Suivant »), une question ouverte (texte), soumettre (dialogue de confirmation) → écran de résultat.
  3. *Examen blanc* : introduction → « Commencer » → naviguer dans la palette (flèches), marquer « à revoir », « Terminer » → dialogue listant les questions sans réponse → confirmer.
  4. *Quiz global* : carte de rappel (« Retourner la carte » par Entrée, auto-évaluation par Tab/Entrée), association (sélection notion puis définition au clavier), remise en ordre (déplacement d'un élément par les boutons « Monter »/« Descendre » ou flèches avec `aria-live` annonçant la nouvelle position), classement (choix de la catégorie par boutons), texte à trous, « Passer », écran de fin.
  5. *Carte des notions* : recherche « clé » + Entrée (sélection et centrage), boutons de zoom, Tab vers la liste « À consolider », ouverture du détail d'une notion, « Revoir dans le cours ».
  6. *Paramètres* : onglets (flèches gauche/droite, `Home`/`End`), interrupteurs (Espace), heures calmes, « Enregistrer » avec confirmation annoncée.
- **EF-4 — Noms accessibles.** Les régions clés ont un instantané d'arbre d'accessibilité versionné (`toMatchAriaSnapshot`) : en-tête figé, menu latéral, panneau des notifications, écran de question du quiz, carte de rappel, palette de l'examen, panneau de détail de la carte, onglets des Paramètres, formulaire de connexion. Tout bouton icône a un nom (`aria-label`) contenant son libellé visible quand il en a un (2.5.3).
- **EF-5 — Focus.** Indicateur de focus visible sur tout élément focusable : contour 2 px `#3A3AA8` (jeton `focus-ring`) décalé de 2 px, contraste ≥ 3:1 contre les fonds clairs et sombres (sur fond `#111113` : contour `#C6F432`) ; aucun élément focusé n'est entièrement masqué par l'en-tête collant ou la barre d'actions fixe (2.4.11 : `scroll-padding-top` = hauteur de l'en-tête, `scroll-padding-bottom` = 72 px sur mobile). Ordre de focus = ordre visuel.
- **EF-6 — Mouvement.** Avec `prefers-reduced-motion: reduce`, aucune transition > 0 ms sur les panneaux, la carte (simulation de forces affichée directement à l'état final, sans animation), le retournement de la carte de rappel et les barres de progression. Aucun contenu animé automatiquement plus de 5 s sans contrôle de pause (2.2.2).
- **EF-7 — Temps limités.** Examen blanc : la limite de temps est essentielle à l'épreuve (exception de 2.2.1) ; l'introduction l'annonce (« Durée : N min. Le temps continue de s'écouler si vous quittez la page. »), le chronomètre est annoncé par `aria-live="polite"` à 5 min et 1 min restantes uniquement (pas chaque seconde). Aucun autre délai n'interrompt une saisie ; une session expirée conserve le texte saisi (brouillon local) et le restaure après reconnexion pour le résumé de chapitre et la question ouverte.
- **EF-8 — Langue.** `<html lang="fr">` ; le contenu d'un cours, d'une question ou d'un message du tuteur rédigé dans une autre langue de cours (`en`, `es`, `de`) porte l'attribut `lang` correspondant sur son conteneur (3.1.2).
- **EF-9 — Authentification accessible (3.3.8).** Coller est autorisé dans tous les champs (e-mail, mot de passe, code d'invitation, clés d'API) ; `autocomplete` correct ; le lien magique reste une alternative sans mémorisation.
- **EF-10 — Déclaration d'accessibilité.** Route publique `/accessibilite` (sans connexion, ajoutée aux routes publiques du middleware) composée selon `docs/product/screens.md` §3, contenu issu du gabarit `apps/web/content/legal/accessibilite.md` : éditeur (variables `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL` ; « [à compléter] » si absentes, ADR-0045), état de conformité « **partiellement conforme** » au référentiel WCAG 2.2 niveau AA (audit interne automatisé et parcours clavier, sans audit externe), date de l'audit (date du commit de `docs/accessibility/audit-v1.md`), pages auditées (liste de l'inventaire), technologies (HTML, CSS, JavaScript, WAI-ARIA), outils (axe-core, Playwright, lecteurs d'écran non utilisés : mention explicite), non-conformités connues (issues de l'audit ; « Aucune non-conformité connue à la date de l'audit. » si vide), dérogations (contenus déposés par l'apprenant et contenus générés à partir de ses apports, vidéos YouTube intégrées comme liens), retour d'information et contact (adresse `LEGAL_CONTACT_EMAIL`), voies de recours (Défenseur des droits, formulaire en ligne et adresse postale « Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07 »).
- **EF-11 — Lien de pied de page.** Le pied de page des pages publiques (authentification, pages légales, `/accessibilite`, `/hors-ligne`) contient le lien « Accessibilité : partiellement conforme » vers `/accessibilite`, au 4ᵉ rang de la liste définie par ADR-0204 (CGU, Confidentialité, Mentions légales, Accessibilité). Le menu « Mon compte » n'est pas modifié.

## 6. Exigences techniques

- **ET-1 — Inventaire.** Réutiliser `responsive-matrix.ts` (SPEC-802) en y ajoutant les états dynamiques : dialogues ouverts (confirmation de soumission du quiz, limite de trois formations, suppression du compte), toasts, états d'erreur de formulaire (connexion avec mot de passe vide), panneau du tuteur en cours de réponse, `/accessibilite`. Fichier `apps/web/e2e/support/a11y-inventory.ts` qui étend l'inventaire.
- **ET-2 — Grille de conformité.** `docs/accessibility/wcag-2-2-grille.md` : tableau `critère | niveau | statut (conforme / non applicable) | mise en œuvre | test(s)` pour les 55 critères A/AA (49 applicables, 6 non applicables), mis à jour par cette spécification ; `docs/accessibility/audit-v1.md` : résumé de l'audit (date, inventaire, résultats axe, parcours, non-conformités). Un test unitaire vérifie que la grille couvre tous les critères A/AA de WCAG 2.2 (liste figée dans `packages/testing/src/wcag22.ts`) et que chaque critère « conforme » référence au moins un test existant.
- **ET-3 — Corrections attendues (minimum, à vérifier une à une)** : lien d'évitement « Aller au contenu » premier focusable ; un seul `h1` par page et hiérarchie sans saut ; `title` de document unique « <Page> · Learny » (2.4.2) ; repères `header`, `nav[aria-label="Menu principal"]`, `main#contenu`, `footer` ; graphiques (anneau de rétention, historique des tentatives, Gantt du programme, carte des notions) avec alternative textuelle (`role="img"` + `aria-label` chiffré, ou tableau équivalent masqué visuellement) ; statuts portés par couleur doublés d'un texte ou d'une icône (1.4.1 : pastilles d'agenda, maîtrise sur la carte, statuts de modules) ; association et classement utilisables sans glisser (2.5.7) ; glisser un nœud de la carte doublé par les boutons de déplacement de vue (2.5.7) et pincement doublé par les boutons de zoom (2.5.1) ; erreurs de formulaire reliées par `aria-describedby` et annoncées (`role="alert"`, ADR-0064) ; messages d'état asynchrones (apport prêt, cours généré, réponse enregistrée, synchronisation hors ligne) annoncés par une région `aria-live="polite"` unique de la coquille (4.1.3) ; dialogues de confirmation pour suppression du compte, soumission d'examen et suppression d'apport (3.3.4) ; préremplissage des informations déjà saisies (3.3.7 : rythme du profil proposé dans une nouvelle formation) ; aide cohérente : le lien « Gérer les notifications » et le menu Mon compte restent au même endroit sur toutes les pages (3.2.6).
- **ET-4 — Contrastes.** Test unitaire `packages/ui/src/tokens/contrast.test.ts` (étend SPEC-309) : toutes les paires texte/fond déclarées dans `packages/ui/src/tokens/pairs.ts` ≥ 4,5:1 (texte normal) ou ≥ 3:1 (texte ≥ 18,66 px gras ou 24 px), composants d'interface et focus ≥ 3:1 (1.4.11). Les couleurs `#62626B` sur `#F4F4F1` et `#F8F8F6` sont vérifiées explicitement ; toute paire non conforme est remplacée par le jeton le plus proche conforme et consignée dans l'ADR des jetons (pas de modification des maquettes).
- **ET-5 — ESLint.** `jsx-a11y` en `error` pour toutes ses règles recommandées (dont `no-autofocus` sauf dialogues, `click-events-have-key-events`, `no-static-element-interactions`, `label-has-associated-control`).
- **ET-6 — Pied de page.** `apps/web/components/site-footer/SiteFooter.tsx` et registre `apps/web/lib/site-footer-links.ts` (ADR-0204) : `export const SITE_FOOTER_LINKS = [ { href: '/legal/cgu', label: 'CGU' }, { href: '/legal/confidentialite', label: 'Confidentialité' }, { href: '/legal/mentions', label: 'Mentions légales' }, { href: '/accessibilite', label: 'Accessibilité : partiellement conforme' } ] as const`. Si le fichier existe déjà (SPEC-806 terminée avant), ajouter seulement l'entrée Accessibilité au 4ᵉ rang ; sinon créer le fichier complet (les trois premières entrées seront servies par SPEC-806). `SiteFooter` est un `footer` contenant un `nav[aria-label="Informations légales"]`.
- **ET-7 — Lecteurs d'écran.** Aucun test automatisé de lecteur d'écran réel ; la vérification des noms et rôles se fait par `toMatchAriaSnapshot` (EF-4) et par `getByRole(…, { name })` dans tous les parcours EF-3.

## 7. Comportements attendus et cas limites

- **CL-1 — Violation axe dans un contenu généré (cours Markdown).** Corrigée dans le moteur de rendu (ADR-0060 : liste blanche `rehype-sanitize` + transformations) : tableaux avec `th scope`, images avec `alt` (texte alternatif fourni par le tuteur, sinon `alt=""` et `role="presentation"` si décoratives), titres décalés pour respecter la hiérarchie.
- **CL-2 — Piège au clavier dans la carte des notions.** La toile SVG est un seul arrêt de tabulation (`tabindex="0"`, `role="application"` avec `aria-roledescription="carte des notions"` et instructions `aria-describedby`) ; Échap ou Tab en sortent toujours (2.1.2).
- **CL-3 — Raccourcis clavier à une touche (2.1.4).** Aucun raccourci à touche unique n'est actif hors focus d'un composant ; s'il en existe (jeux), ils ne sont actifs que lorsque le composant a le focus.
- **CL-4 — Zoom texte 200 %.** Aucune perte d'information ni chevauchement (1.4.4), vérifié à 1280 px avec `document.documentElement.style.fontSize = '180%'` (90 % × 2).
- **CL-5 — Espacement de texte (1.4.12).** Injection du signet d'espacement (hauteur de ligne 1,5, paragraphes 2×, lettres 0,12 em, mots 0,16 em) : aucun texte coupé sur l'accueil, le cours et le quiz.
- **CL-6 — Infobulle au survol (1.4.13).** Les Tooltip Radix restent affichées au survol de leur contenu, se ferment par Échap et ne masquent pas l'élément déclencheur.
- **CL-7 — Remise en ordre au clavier.** Chaque déplacement annonce « <élément> déplacé en position n sur N » via `aria-live` ; aucun glisser n'est requis.
- **CL-8 — Message du tuteur en flux (SSE).** Pas d'annonce à chaque fragment : l'annonce `aria-live` se fait une fois, à la fin du message (« Réponse du tuteur reçue »), le contenu restant consultable.
- **CL-9 — Variables légales absentes.** `/accessibilite` affiche « [à compléter] » pour l'éditeur et le contact (pas d'invention) ; la page reste conforme et accessible.
- **CL-10 — Notification de chronomètre en examen.** Pas plus de deux annonces (5 min, 1 min) ; soumission automatique annoncée (« Temps écoulé : vos réponses ont été envoyées. ») et focus placé sur le titre des résultats.

## 8. Instructions d'implémentation

1. Créer `packages/testing/src/wcag22.ts` (liste des critères A/AA), `docs/accessibility/wcag-2-2-grille.md` (squelette) et le test de couverture de la grille. Commit `test(SPEC-803): ajoute la grille WCAG 2.2 AA`.
2. Créer `a11y-inventory.ts` et `a11y-audit.spec.ts` ; exécuter l'audit initial ; enregistrer `evidence/SPEC-803/axe-before.json`. Commit `test(SPEC-803): audite toutes les pages avec axe`.
3. Passer `jsx-a11y` en `error`, corriger les fautes signalées. Commit `fix(SPEC-803): corrige les erreurs jsx-a11y`.
4. Corriger par famille (un commit `fix(SPEC-803): …` chacune) : repères et titres ; focus visible et 2.4.11 ; contrastes (ET-4) ; alternatives des graphiques ; jeux sans glisser ; formulaires et erreurs ; région `aria-live` unique ; langue des contenus ; mouvement réduit ; temps limités.
5. Écrire les six parcours clavier (`keyboard-journeys.spec.ts`) et les instantanés ARIA (`aria-snapshots.spec.ts`). Commit `test(SPEC-803): ajoute les parcours clavier et les instantanés ARIA`.
6. Créer `/accessibilite` (gabarit Markdown rendu par le moteur sécurisé), `SiteFooter` et le registre de liens (ET-6), route publique du middleware. Commit `feat(SPEC-803): publie la déclaration d'accessibilité`.
7. Compléter la grille et `docs/accessibility/audit-v1.md` à partir des résultats finaux (aucune donnée inventée : chaque statut renvoie à un test). Commit `docs(SPEC-803): consigne l'audit d'accessibilité`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/testing/src/wcag22.ts`, `docs/accessibility/wcag-2-2-grille.md`, `docs/accessibility/audit-v1.md`, `apps/web/e2e/support/a11y-inventory.ts`, `apps/web/e2e/specs/p8/a11y-audit.spec.ts`, `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts`, `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` (+ fichiers `.aria.yml`), `apps/web/e2e/specs/p8/a11y-visual.spec.ts`, `apps/web/app/accessibilite/page.tsx`, `apps/web/content/legal/accessibilite.md`, `apps/web/components/site-footer/SiteFooter.tsx`, `apps/web/lib/site-footer-links.ts` (si absent), `packages/ui/src/tokens/pairs.ts`.
- **Modifiés** : composants `@learny/ui` et écrans concernés par les corrections, `eslint.config.mjs` (jsx-a11y), `apps/web/middleware.ts` (route publique), mise en page d'authentification SPEC-308 (insertion de `SiteFooter`), `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `expectNoAxeViolations` (SPEC-309), inventaire SPEC-802, moteur Markdown sécurisé (ADR-0060).

## 10. Interface et conformité visuelle

- Mode `tokens`. Page `/accessibilite` sans coquille connectée : en-tête de page (sur-titre 14 px `#62626B` « Informations légales », `h1` 34 px Space Grotesk « Déclaration d'accessibilité »), carte blanche bordée `#E7E6E1` rayon 24 px contenant le texte (titres `h2` 20 px), `SiteFooter` en bas (liens 14 px, soulignés au survol et au focus).
- Indicateur de focus : vérifié par jetons (`outline-color` `#3A3AA8` sur fond clair, `#C6F432` sur fond `#111113`, `outline-width` 2 px).
- Contrôles automatisés : (1) `expectTokens` sur `/accessibilite` (titre, carte, liens) et sur le focus d'un bouton citron, d'un lien du menu sombre et d'un champ ; (2) structure de la page (ordre : sur-titre, `h1`, sections « État de conformité », « Résultats des tests », « Contenus non accessibles », « Établissement de cette déclaration », « Retour d'information et contact », « Voies de recours », pied) ; (4) lignes de base `toHaveScreenshot` de `/accessibilite` desktop/mobile et de l'état focus des composants principaux de la galerie `/_dev/ui` (horloge figée 2026-11-11T12:20:00Z, seed SPEC-115). Les lignes de base d'écrans maquettés modifiées par les corrections sont mises à jour avec justification et la comparaison ≤ 12 % de l'écran correspondant est rejouée.

## 11. Critères d'acceptation

- **CA-1** — Audit axe : 0 violation serious/critical sur 100 % des états de l'inventaire ET-1, en desktop et en mobile (rapport `axe-report.json` avec le nombre d'états audités).
- **CA-2** — Les six parcours clavier d'EF-3 réussissent sans aucun événement de souris (`page.mouse` non utilisé, vérifié par un garde de test) et vont jusqu'à leur état final.
- **CA-3** — Les 9 instantanés ARIA d'EF-4 correspondent ; aucun bouton sans nom accessible dans l'inventaire.
- **CA-4** — Toutes les paires de jetons de `pairs.ts` respectent les ratios d'ET-4 ; le focus est visible (contour mesuré ≥ 2 px, contraste ≥ 3:1) sur chaque type d'élément interactif.
- **CA-5** — Avec `reducedMotion: 'reduce'`, la durée calculée des transitions du panneau tuteur, du retournement de carte et du menu est 0 ms et la carte des notions s'affiche sans animation.
- **CA-6** — La grille `wcag-2-2-grille.md` couvre les 55 critères A/AA (49 applicables, 6 non applicables), chaque critère « conforme » référence un test existant.
- **CA-7** — `/accessibilite` est accessible sans connexion (200), contient les sections d'EF-10 et affiche « [à compléter] » quand les variables légales sont absentes ; le lien « Accessibilité : partiellement conforme » figure au pied de `/connexion`.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-803] …')`) :
  - `packages/testing/src/wcag22.test.ts` : 55 critères A/AA, dont 2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8 ; absence de 4.1.1.
  - `docs/accessibility` via `packages/testing/src/wcag-grid.test.ts` : couverture de la grille et existence des tests référencés.
  - `packages/ui/src/tokens/contrast.test.ts` : ratios d'ET-4.
  - `apps/web/components/site-footer/SiteFooter.test.tsx` : 4 liens dans l'ordre, `nav` nommée.
  - `apps/web/app/accessibilite/page.test.tsx` : remplacement des variables, « [à compléter] ».
- **Intégration** (`[SPEC-803]`) :
  - `apps/web/test/integration/public-routes.test.ts` : `GET /accessibilite` sans cookie → 200 ; middleware ne redirige pas vers `/connexion`.
  - `packages/ui/test/integration/live-region.test.tsx` : une seule région `aria-live` dans la coquille, annonces séquentielles (apport prêt, synchronisation).
- **End-to-end** (`@SPEC-803`, vidéo) :
  - `a11y-audit.spec.ts` : `audit axe desktop @SPEC-803`, `audit axe mobile @SPEC-803` (parcours de l'inventaire, rapport fusionné).
  - `keyboard-journeys.spec.ts` : `parcours clavier connexion @SPEC-803`, `… quiz de validation @SPEC-803`, `… examen blanc @SPEC-803`, `… quiz global @SPEC-803`, `… carte des notions @SPEC-803`, `… paramètres @SPEC-803` (garde : `page.mouse` remplacé par un proxy qui fait échouer le test s'il est appelé).
  - `aria-snapshots.spec.ts` : `noms accessibles des régions clés @SPEC-803`.
  - `reduced-motion.spec.ts` : `mouvement réduit @SPEC-803` (contexte `reducedMotion: 'reduce'`).
  - `text-spacing.spec.ts` : `zoom 200 % et espacement du texte @SPEC-803` (CL-4, CL-5).
- **Visuel** (`@SPEC-803 @visual`, `a11y-visual.spec.ts`) : `/accessibilite` (jetons, structure, lignes de base) et états de focus.
- **Non-régression** : rejouer tous les tests e2e des phases P3, P6 et P7 (`@SPEC-3`, `@SPEC-6`, `@SPEC-7` via `--grep "@SPEC-(3|6|7)"`) et les `@visual` existants.

| Critère | Tests |
|---|---|
| CA-1 | `a11y-audit.spec.ts` (desktop, mobile) |
| CA-2 | `keyboard-journeys.spec.ts` (6 tests) |
| CA-3 | `aria-snapshots.spec.ts` |
| CA-4 | `contrast.test.ts`, `a11y-visual.spec.ts` (focus) |
| CA-5 | `reduced-motion.spec.ts` |
| CA-6 | `wcag22.test.ts`, `wcag-grid.test.ts` |
| CA-7 | `public-routes.test.ts`, `page.test.tsx`, `SiteFooter.test.tsx`, `a11y-visual.spec.ts` |

## 13. Preuves attendues

- Vidéos des six parcours clavier (la vidéo montre l'indicateur de focus à chaque étape).
- `evidence/SPEC-803/axe-before.json`, `axe-report.json` (après), nombre d'états audités et de violations par impact.
- Captures : `accessibilite-desktop.png`, `accessibilite-mobile.png`, `focus-*.png`.
- Copie de `docs/accessibility/wcag-2-2-grille.md` référencée dans `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), plus : aucune violation serious/critical sur l'inventaire complet, six parcours clavier verts, grille WCAG complète et justifiée par des tests, déclaration publiée sans aucune information inventée.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0038 (WCAG 2.2 AA, Radix, axe), ADR-0045 (identité légale en configuration, « [à compléter] »), ADR-0046 (route en français sans accent), ADR-0059, ADR-0060, ADR-0064.
- **ADR-0204 créé** (partagé avec SPEC-806) : route `/accessibilite`, statut « partiellement conforme » tant qu'aucun audit externe n'est réalisé, registre unique des liens de pied de page et ordre (CGU, Confidentialité, Mentions légales, Accessibilité), pied présent sur toutes les pages publiques.
- Décision : les critères 1.2.x et 1.4.2 sont non applicables en V1 (Learny ne produit pas de média ; les apports sont des contenus tiers) ; ils seront réévalués par SPEC-901/902 (lecteur d'extraits audio/vidéo).
- Hypothèse : aucun test avec un lecteur d'écran réel n'est automatisable dans l'environnement ; la déclaration le mentionne explicitement.
