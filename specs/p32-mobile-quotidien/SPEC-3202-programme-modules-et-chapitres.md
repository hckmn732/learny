---
id: SPEC-3202
title: Programme, modules et chapitres en lecture
phase: P32
priority: mobile
depends_on: [SPEC-3102]
business_rules: [BR-PRO-01, BR-FOR-05, BR-FOR-07, BR-FOR-08, BR-FOR-11, BR-COU-08]
screens: [SCR-05, SCR-06]
adrs: [ADR-3002, ADR-3003]
visual: mockup
---

# SPEC-3202 — Programme, modules et chapitres en lecture

## 1. Objectif

Livrer l'onglet Programme : la formation en cours avec son avancement, la liste des modules
(statuts validé, en cours, verrouillé) et de leurs chapitres, la reprise du chapitre en cours,
la vue calendrier, le changement de formation et les renvois au web pour la création et l'import.

## 2. Contexte

Maquette : écran 03 « Programme » (`view.html#screen=programme`, fonctions `programme` et
`chapter` de `design/app-mobile/assets/screens.js`, exports `{ios,android}-03-programme.png`,
état `design/app-mobile/exports/states/ios-programme-calendrier.png`). Équivalents web : SCR-05
et SCR-06 (`Programme.dc.html`, `Module.dc.html`, SPEC-606, SPEC-607). Contrats :
`packages/contracts/src/programme.ts` (`GET /formations/:fid/programme`), `course-module.ts` et
`learning.ts` (`GET /formations/:fid/modules/:mid`), `formation-management.ts` (`GET /formations`,
`PATCH /me/current-formation`). Périmètre : ADR-3002 (création, import, ajustement, apports →
web).

## 3. Dépendances

- **SPEC-3102** (coquille, `openOnWeb`, états communs).
- Données SPEC-115 : SAP S/4HANA Finance, 38 %, module 3 sur 7 « Comptabilité générale »,
  chapitre 2 « Saisie des pièces comptables » en cours, module 4 verrouillé, module 2 validé à
  91 %.

## 4. Règles métier couvertes

- BR-PRO-01 — Avancement affiché = valeur serveur (modules validés / total), « 38 % ».
- BR-FOR-05 — Modules ordonnés avec titre, dates prévues, seuil, nombre de chapitres.
- BR-FOR-07 — Statuts verrouillé / en cours / validé avec pastilles « En cours » (neutre sur
  Android, citron sur iOS, ADR-3003 et README de la maquette) et « Validé ».
- BR-FOR-08 — Module verrouillé : icône cadenas et fiche « Se débloque quand le quiz du module N
  est validé ».
- BR-FOR-11 — « Changer de formation » (sélecteur du sur-titre) liste les formations actives et
  en pause ; le choix appelle `PATCH /me/current-formation`.
- BR-COU-08 — Progression de lecture par chapitre (durée restante ou « Validé ») affichée depuis
  le serveur.

## 5. Exigences fonctionnelles

- **EF-1** — En-tête : sur-titre nom de la formation (bouton ouvrant « Changer de formation »),
  titre « Programme », action « + » (iOS, en-tête) ou FAB citron « + » (Android) ouvrant la
  fiche « Nouvelle formation » qui renvoie au web (`/formations/nouvelle`).
- **EF-2** — Carte formation : sigle, titre, « Module 3 sur 7 · 2 nov. – 11 déc. », pourcentage,
  barre citron.
- **EF-3** — `Segmented` « Modules » / « Calendrier » ; lien « + Importer votre programme » sous le
  sélecteur → fiche de renvoi au web (`/formations/[fid]/programme`).
- **EF-4** — Vue Modules : module en cours déplié (numéro citron, titre, « 4 chapitres · quiz à
  80 % », chapitres avec état validé/en cours/à venir et durée, bouton encre « Reprendre le
  chapitre 2 » → cours SPEC-3302) ; modules validés et à venir repliés en accordéon ; module
  verrouillé non dépliable (fiche BR-FOR-08).
- **EF-5** — Appui sur un chapitre lisible → cours du chapitre ; sur le quiz du module (ligne
  « Quiz de validation ») → SPEC-3304.
- **EF-6** — Vue Calendrier : modules sur une frise par semaine (dates prévues), semaine
  courante marquée, conforme à l'état `ios-programme-calendrier.png`.
- **EF-7** — Formation en pause : bandeau « Formation en pause » et action « Reprendre sur le web ».

## 6. Exigences techniques

- **ET-1** — Hooks `useFormations()`, `useProgramme(fid)`, `useModule(fid, mid)` ; formation
  courante = `GET /me` (`currentFormationId`) sinon première active.
- **ET-2** — Accordéon animé (Reanimated, hauteur mesurée), réduit à 0 ms si réduction des
  animations ; rôle bouton avec `accessibilityState.expanded`.
- **ET-3** — Aucune route d'écriture du programme n'est appelée (ADR-3002).

## 7. Comportements attendus et cas limites

- **CL-1** — Programme encore proposé (non validé) : `EmptyState` « Programme à valider sur le
  web » avec « Continuer sur le web ».
- **CL-2** — Formation terminée : tous les modules validés, bandeau « Formation terminée » et
  renvoi vers le bilan web.
- **CL-3** — Une seule formation : le sélecteur affiche la formation sans chevron.
- **CL-4** — Hors ligne : programme du cache, changement de formation désactivé.
- **CL-5** — Module de plus de 12 chapitres : liste complète défilante, bouton de reprise visible.

## 8. Instructions d'implémentation

1. Hooks de données, composants `FormationCard`, `ModuleAccordion`, `ChapterRow`,
   `ProgrammeCalendar`, `FormationSwitcherSheet`, `Fab` (Android).
2. Écran `(app)/programme/index.tsx` et route `(app)/programme/module/[moduleId].tsx` (détail
   d'un module en lecture, ouvert depuis l'accordéon replié).
3. Renvois web et libellés.
4. Tests, Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/src/features/programme/**`, `apps/mobile/src/data/{formations,programme,module}.ts`,
  `apps/mobile/app/(app)/programme/module/[moduleId].tsx`, tests,
  `apps/mobile/e2e/flows/SPEC-3202-*.yaml`.
- **Modifiés** — `apps/mobile/app/(app)/programme/index.tsx`, `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{programme,course-module,learning,formation-management}.ts`.

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-03-programme.png`, `android-03-programme.png` (vue Modules, module 3
déplié) et `states/ios-programme-calendrier.png` (vue Calendrier). Masques : barre d'état,
barre d'onglets. `testID` : `programme-formation-card`, `programme-segmented`,
`programme-import`, `module-<n>`, `chapter-<id>`, `programme-resume`, `programme-fab`,
`formation-switcher`. Le FAB Android ne recouvre aucun bouton (vérifié par un test de
disposition).

## 11. Critères d'acceptation

- **CA-1** — Les valeurs de démonstration sont affichées exactement (38 %, « Module 3 sur 7 »,
  quatre chapitres du module 3 avec leurs états, module 4 verrouillé, module 2 « Validé »).
- **CA-2** — « Reprendre le chapitre 2 » ouvre le cours au chapitre 2 ; le module verrouillé
  affiche sa condition de déblocage.
- **CA-3** — Changer de formation met à jour l'écran et la formation courante côté serveur.
- **CA-4** — Création, import et ajustement renvoient au web, sans appel d'écriture du programme.
- **CA-5** — Vues Modules et Calendrier conformes à la maquette (écart ≤ 12 %).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3202]` `features/programme/view-model.test.ts` (statuts, durée
  restante, ordre). Jest `[SPEC-3202]` : `programme-screen.test.tsx`, `module-accordion.test.tsx`,
  `formation-switcher.test.tsx`, `fab-layout.test.tsx`. Couvre CA-1, CA-2, CA-4.
- **Intégration** — Vitest `[SPEC-3202]` `test/integration/programme.int.test.ts` : programme
  et module seedés, `PATCH /me/current-formation`. Couvre CA-1, CA-3.
- **End-to-end** — Maestro `@SPEC-3202` (vidéo) : `SPEC-3202-programme.yaml` (valeurs,
  accordéon, verrouillé, reprendre), `SPEC-3202-changer-formation.yaml`,
  `SPEC-3202-renvois-web.yaml`. Couvre CA-1, CA-2, CA-3, CA-4.
- **Visuel** — `@SPEC-3202 @visual` : Modules iOS/Android, Calendrier iOS. Couvre CA-5.
- **Non-régression** — `[SPEC-3102]`.

| Critère | Tests |
|---|---|
| CA-1 | view-model.test, programme.int, SPEC-3202-programme.yaml |
| CA-2 | module-accordion.test, SPEC-3202-programme.yaml |
| CA-3 | programme.int, SPEC-3202-changer-formation.yaml |
| CA-4 | programme-screen.test, SPEC-3202-renvois-web.yaml |
| CA-5 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3202/` : `acceptance.md`, rapports, vidéos, captures et comparaisons.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3202` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-3002, ADR-3003.
- Le détail d'un module (apports, ressources) reste en lecture ; l'ajout d'apports est renvoyé au
  web.
