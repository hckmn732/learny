---
id: SPEC-3302
title: Lecture du cours
phase: P33
priority: mobile
depends_on: [SPEC-3301, SPEC-3202]
business_rules: [BR-COU-02, BR-COU-04, BR-COU-05, BR-COU-06, BR-COU-07, BR-COU-08, BR-COU-09, BR-COU-11, BR-NAV-04]
screens: [SCR-07]
adrs: [ADR-3002, ADR-3003, ADR-3009, ADR-3010]
visual: mockup
---

# SPEC-3302 — Lecture du cours

## 1. Objectif

Livrer l'écran Cours : lecture d'un chapitre du cours d'un module, progression de lecture
enregistrée, navigation entre chapitres, blocs pédagogiques, citations des sources, signalement
d'erreur, résumé de fin de chapitre et accès au tuteur et au quiz.

## 2. Contexte

Maquette : écran 04 « Cours » (`view.html#screen=cours`, fonction `cours` de
`design/app-mobile/assets/screens.js`, exports `{ios,android}-04-cours.png`), lue avec ADR-3003
(pas de signet). Équivalent web : SCR-07 (`Cours.dc.html`, SPEC-609). Contrats :
`packages/contracts/src/course.ts` (`GET /modules/:mid/course`), `course-reading.ts`
(`PUT /courses/:cid/progress`, `POST /chapters/:cid/summary`, `POST /course-sections/:sid/report`,
`GET /course-citations/:cid/source`), `course-media.ts`. Rendu Markdown et blocs : SPEC-3301,
ADR-3009. Libellés web : `packages/i18n/src/fr/course.ts`, `course-module.ts`.

## 3. Dépendances

- **SPEC-3301** (Markdown, blocs, extraits), **SPEC-3202** (navigation depuis Programme).
- Données SPEC-115 : module 3, chapitre 2 « Saisie des pièces comptables », 8 min de lecture,
  4 apports.

## 4. Règles métier couvertes

- BR-COU-02 — Chaque citation est un lien vers sa source (`GET /course-citations/:cid/source`),
  ouverte dans une fiche (extrait, page ou minute) avec « Ouvrir la ressource ».
- BR-COU-04 — Fiche « À retenir » en fin de chapitre (3 à 7 points).
- BR-COU-05 — « Question éclair » : réponse masquée, « Afficher la réponse ».
- BR-COU-06 — Bloc « Ne pas confondre » (avertissement orange de la maquette).
- BR-COU-07 — En fin de chapitre, champ « Résumez ce chapitre avec vos mots » (3 à 4 phrases
  suggérées), envoi `POST /chapters/:cid/summary`, retour du tuteur affiché.
- BR-COU-08 — Progression de lecture : pourcentage du chapitre calculé au défilement, barre
  citron sous l'en-tête, enregistrée par `PUT /courses/:cid/progress` (au plus toutes les 10 s et
  à la sortie).
- BR-COU-09 — « Signaler une erreur » sur une section (`POST /course-sections/:sid/report`) ;
  « Corriger » renvoie au web.
- BR-COU-11 — Badge « Chapitre n sur N », temps de lecture, « Construit à partir de N apports »,
  sommaire (feuille), chapitre précédent/suivant, carte « Prêt pour le quiz de validation ? ».
- BR-NAV-04 — Le fil d'Ariane web devient l'en-tête « Chapitre 2 sur 4 » avec retour vers
  Programme (pile de l'onglet).

## 5. Exigences fonctionnelles

- **EF-1** — Route `cours/[courseId]?chapitre=<cid>` empilée au-dessus des onglets ; en-tête :
  retour, « Chapitre 2 sur 4 », bouton « Sommaire » ; barre de progression de lecture.
- **EF-2** — Corps : étiquette module (indigo), titre du chapitre, méta « 8 min de lecture ·
  4 apports · mis à jour hier », introduction, sections Markdown avec blocs (SPEC-3301).
- **EF-3** — Barre inférieure : bouton encre « Demander au tuteur » (ouvre la feuille tuteur,
  SPEC-3303) et bouton d'icône « Quiz de validation » (ouvre le quiz, SPEC-3304), libellé
  accessible « Ouvrir le quiz de validation ».
- **EF-4** — Fin de chapitre : « À retenir », résumé (BR-COU-07), « Chapitre suivant » ou carte
  « Prêt pour le quiz de validation ? » au dernier chapitre.
- **EF-5** — Appui long sur une section : menu « Demander au tuteur sur ce passage » (ouvre le
  tuteur avec le passage en contexte), « Signaler une erreur », « Corriger sur le web ».
- **EF-6** — Sommaire : feuille listant chapitres et sections avec état de lecture ; appui →
  défilement vers la section.
- **EF-7** — Cours non encore généré : `EmptyState` « Le cours est en préparation » avec
  rafraîchissement ; génération lancée depuis le web seulement.

## 6. Exigences techniques

- **ET-1** — `useModuleCourse(mid)` ; progression locale par chapitre lissée et envoyée par
  `useCourseProgress` (débounce 10 s, envoi à la sortie et au passage en arrière-plan).
- **ET-2** — Mesure du défilement par `onScroll` throttlé (16 ms) et positions des sections
  (`onLayout`) ; aucune re-rendu de tout le contenu à chaque défilement.
- **ET-3** — Le temps de lecture ≥ 5 min compte pour la série côté serveur (BR-GAM-01) : la
  progression envoyée inclut la durée active de lecture si le contrat la prévoit ; sinon rien
  n'est inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Hors ligne : chapitre en cache lisible, progression mise en file locale et envoyée
  au retour du réseau (dernière valeur gagne), résumé et signalement désactivés.
- **CL-2** — Version du cours changée pendant la lecture : bandeau « Une nouvelle version est
  disponible » avec « Recharger ».
- **CL-3** — Chapitre de plus de 10 000 mots : rendu par sections virtualisées (`FlatList`).
- **CL-4** — Lien de citation vers une ressource supprimée : fiche « Source indisponible ».

## 8. Instructions d'implémentation

1. Hooks de cours et de progression.
2. Écran, en-tête, barre de progression, barre inférieure, sommaire.
3. Menu de section, signalement, fiche source, résumé.
4. Tests, Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/app/cours/[courseId].tsx`, `apps/mobile/src/features/cours/**`,
  `apps/mobile/src/data/course.ts`, tests, `apps/mobile/e2e/flows/SPEC-3302-*.yaml`.
- **Modifiés** — `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{course,course-reading,course-media}.ts`,
  `packages/i18n/src/fr/{course,course-module}.ts`.

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-04-cours.png`, `android-04-cours.png` (chapitre 2, haut de page,
progression 50 %). Masques : barre d'état, indicateur d'accueil ; l'icône signet de la maquette
est absente (ADR-3003), sa zone est masquée. `testID` : `course-header`, `course-progress`,
`course-section-<id>`, `course-ask-tutor`, `course-open-quiz`, `course-toc`,
`course-summary-input`, `course-next`.

## 11. Critères d'acceptation

- **CA-1** — Le chapitre 2 s'affiche avec le titre, la méta et les sections de la maquette ;
  « Chapitre 2 sur 4 » et le retour vers Programme fonctionnent.
- **CA-2** — Faire défiler jusqu'à la fin enregistre 100 % côté serveur et Programme affiche le
  chapitre comme lu.
- **CA-3** — Une citation ouvre sa source ; un signalement crée un signalement ouvert.
- **CA-4** — Le résumé est envoyé et le retour du tuteur (IA simulée) s'affiche.
- **CA-5** — L'écran est conforme à la maquette (écart ≤ 12 % hors zones masquées).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3302]` `features/cours/progress.test.ts` (calcul du
  pourcentage, débounce, file hors ligne). Jest `[SPEC-3302]` : `course-screen.test.tsx`,
  `section-menu.test.tsx`, `summary.test.tsx`, `toc-sheet.test.tsx`. Couvre CA-1, CA-2, CA-3.
- **Intégration** — Vitest `[SPEC-3302]` `test/integration/course.int.test.ts` : cours seedé,
  progression, signalement, résumé (LLM simulé). Couvre CA-2, CA-3, CA-4.
- **End-to-end** — Maestro `@SPEC-3302` (vidéo) : `SPEC-3302-lecture.yaml` (ouverture depuis
  Programme, défilement, progression), `SPEC-3302-sources-et-resume.yaml`. Couvre CA-1, CA-2,
  CA-3, CA-4.
- **Visuel** — `@SPEC-3302 @visual` : haut du chapitre iOS/Android. Couvre CA-5.
- **Non-régression** — `[SPEC-3301]`, `[SPEC-3202]`.

| Critère | Tests |
|---|---|
| CA-1 | course-screen.test, SPEC-3302-lecture.yaml |
| CA-2 | progress.test, course.int, SPEC-3302-lecture.yaml |
| CA-3 | section-menu.test, course.int, SPEC-3302-sources-et-resume.yaml |
| CA-4 | summary.test, course.int |
| CA-5 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3302/` : `acceptance.md`, rapports, vidéos, captures et comparaisons, état de
progression lu en base après le flux.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3302` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-3002, ADR-3003, ADR-3009, ADR-3010.
- La sélection de texte libre (BR-TUT-01, ≥ 12 caractères) est remplacée sur mobile par l'appui
  long sur une section (EF-5), selon ADR-3010 §1.
