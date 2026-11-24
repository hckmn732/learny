---
id: SPEC-3203
title: Agenda jour, semaine, mois et replanification
phase: P32
priority: mobile
depends_on: [SPEC-3102]
business_rules: [BR-AGE-01, BR-AGE-02, BR-AGE-04, BR-AGE-05, BR-AGE-06, BR-AGE-07]
screens: [SCR-12]
adrs: [ADR-3002, ADR-3003, ADR-0029]
visual: mockup
---

# SPEC-3203 — Agenda jour, semaine, mois et replanification

## 1. Objectif

Livrer l'onglet Agenda : vues Jour, Semaine et Mois communes à toutes les formations, filtre par
formation, détail d'une activité avec « Ouvrir » et « Replanifier » (trois créneaux proposés),
conformes à la maquette et aux règles de l'agenda web.

## 2. Contexte

Maquette : écran 08 « Agenda » (`view.html#screen=agenda`, fonctions `agenda`, `slotCard`,
`monthGrid` de `design/app-mobile/assets/screens.js`, exports `{ios,android}-07-agenda.png`, état
`design/app-mobile/exports/states/android-agenda-mois.png`). Note du README de la maquette : les
chips gardent leur couleur de sens (fait, à faire, à venir). Équivalent web : SCR-12
(`Agenda.dc.html`, SPEC-704, SPEC-705). Contrats : `packages/contracts/src/agenda.ts`
(`GET /agenda?from=&to=&formation=`), `agenda-deplacer-et-reajuster-le-planning.ts`
(`GET /slots/:id/alternatives`, `POST /slots/:id/move`). Couleurs des types :
`packages/ui/src/tokens/slot-kinds.ts`. Planificateur : ADR-0029 (le mobile n'en calcule rien).

## 3. Dépendances

- **SPEC-3102** (coquille, feuilles).
- Données SPEC-115 : mercredi 11 novembre, Relecture du cours 09:00 (fait), Échauffement 13:50,
  Quiz de validation 14:00, Quiz global 17:00.

## 4. Règles métier couvertes

- BR-AGE-01 — Agenda commun filtrable par formation (« Toutes les formations » ou une
  formation) ; vues Jour, Semaine, Mois ; navigation précédent/suivant bornée aux dates des
  formations ; bouton « Aujourd'hui » ; mini-calendrier du mois dans la vue Mois.
- BR-AGE-02 — Chaque type d'activité a sa couleur (jetons `slot-kinds`) et son libellé ; légende
  disponible dans la fiche « Légende » (icône liste de l'en-tête).
- BR-AGE-04 — Statut du créneau affiché par une puce : Fait, Faire (à faire maintenant), Dans N
  min, À venir, Manqué, Déplacé.
- BR-AGE-05 — Sélection d'une activité : carte « Activité sélectionnée » (type, titre, jour,
  horaire, informations, « Ouvrir », « Replanifier ») ; « Replanifier » propose les 3 prochains
  créneaux libres compatibles.
- BR-AGE-06 — Totaux de la période en bas de la vue (heures prévues, faites, marges restantes).
- BR-AGE-07 — Ligne de l'heure actuelle sur le jour courant (13:20) ; un jour touché en vue
  Semaine ou Mois ouvre la vue Jour.

## 5. Exigences fonctionnelles

- **EF-1** — En-tête : sur-titre date longue, titre « Agenda », icône « Légende » ; sélecteur de
  formation (puce avec icône couches et chevron) ouvrant une feuille de choix.
- **EF-2** — `Segmented` « Jour / Semaine / Mois » ; bande des jours de la semaine (L à D) avec
  le jour sélectionné en encre et citron, points d'activité sous chaque jour.
- **EF-3** — Vue Jour : frise horaire (heure, pastille de type, carte : titre, détail, puce de
  statut, lien « Ouvrir » pour les activités ouvrables) ; l'activité imminente est une carte encre
  avec lien citron ; carte « Activité sélectionnée » sous la frise.
- **EF-4** — Vue Semaine : liste des jours avec leurs activités résumées ; appui → vue Jour.
- **EF-5** — Vue Mois : grille mensuelle, jours marqués, appui → vue Jour (état
  `android-agenda-mois.png`).
- **EF-6** — « Ouvrir » : quiz de validation → SPEC-3304, quiz global → SPEC-3305, cours → SPEC-3302,
  échauffement → SPEC-3305, autres types (exercice, examen blanc…) → web.
- **EF-7** — « Replanifier » : feuille avec 3 créneaux (`GET /slots/:id/alternatives`), choix →
  `POST /slots/:id/move`, toast et rafraîchissement ; aucun créneau → message et renvoi web.
- **EF-8** — Filtre sans activité dans la période : `EmptyState` « Aucune activité pour cette
  formation sur cette période ».
- **EF-9** — Balayage horizontal sur la bande des jours ou la grille : période précédente /
  suivante (bornée).

## 6. Exigences techniques

- **ET-1** — `useAgenda(from, to, formation)` ; périodes calculées dans le fuseau utilisateur
  (lundi au dimanche) à partir de `clock.now()`.
- **ET-2** — Paramètres d'écran (`vue`, `date`, `formation`) dans l'URL de la route
  (`/agenda?vue=jour&date=2026-11-11&formation=all`), comme le web, pour les liens profonds.
- **ET-3** — Mutation de déplacement : invalide `['agenda']` et `['home']`.

## 7. Comportements attendus et cas limites

- **CL-1** — Créneau déplacé par une autre session entre l'ouverture et le choix (`409`) : toast
  « Ce créneau vient de changer » et nouvelles propositions.
- **CL-2** — Jour hors des dates des formations : navigation bloquée, bouton inactif.
- **CL-3** — Changement de fuseau du profil : périodes recalculées au prochain chargement.
- **CL-4** — Hors ligne : période en cache affichée, « Replanifier » désactivé.

## 8. Instructions d'implémentation

1. Hooks et calculs de période (`src/features/agenda/period.ts`).
2. Composants `DayStrip`, `DayTimeline`, `SlotCard`, `WeekList`, `MonthGrid`,
   `SelectedActivityCard`, `ReplanSheet`, `FormationFilterSheet`, `LegendSheet`.
3. Écran `(app)/agenda/index.tsx`, paramètres d'URL, gestes.
4. Tests, Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/src/features/agenda/**`, `apps/mobile/src/data/agenda.ts`, tests,
  `apps/mobile/e2e/flows/SPEC-3203-*.yaml`.
- **Modifiés** — `apps/mobile/app/(app)/agenda/index.tsx`, `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/contracts/src/{agenda,agenda-deplacer-et-reajuster-le-planning}.ts`,
  `packages/ui/src/tokens/slot-kinds.ts`, `packages/i18n/src/fr/agenda.ts`.

## 10. Interface et conformité visuelle

Mode `mockup` : `ios-07-agenda.png`, `android-07-agenda.png` (vue Jour du 11 novembre, Quiz de
validation sélectionné) et `states/android-agenda-mois.png`. Masques : barre d'état, barre
d'onglets. `testID` : `agenda-view`, `agenda-day-<date>`, `slot-<id>`, `slot-open-<id>`,
`selected-activity`, `replan`, `agenda-filter`, `agenda-totals`. Contraste du lien « Ouvrir »
citron sur encre conservé (écart assumé de la maquette).

## 11. Critères d'acceptation

- **CA-1** — Vue Jour du 11 novembre : quatre activités aux heures, titres et statuts de la
  maquette, ligne de l'heure à 13:20.
- **CA-2** — Semaine et Mois s'affichent ; toucher un jour ouvre sa vue Jour.
- **CA-3** — Le filtre par formation restreint les activités ; un filtre sans activité affiche
  l'état vide.
- **CA-4** — « Replanifier » propose 3 créneaux et le déplacement est visible dans l'agenda et
  dans Aujourd'hui.
- **CA-5** — Vues Jour et Mois conformes à la maquette (écart ≤ 12 %).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3203]` `period.test.ts` (semaines, mois, bornes, fuseau),
  `slot-status.test.ts`. Jest `[SPEC-3203]` : `agenda-screen.test.tsx`, `replan-sheet.test.tsx`,
  `filter-sheet.test.tsx`. Couvre CA-1, CA-2, CA-3.
- **Intégration** — Vitest `[SPEC-3203]` `test/integration/agenda.int.test.ts` : `/agenda` par
  période et filtre, alternatives, déplacement. Couvre CA-3, CA-4.
- **End-to-end** — Maestro `@SPEC-3203` (vidéo) : `SPEC-3203-vues.yaml`, `SPEC-3203-filtre.yaml`,
  `SPEC-3203-replanifier.yaml`. Couvre CA-1, CA-2, CA-3, CA-4.
- **Visuel** — `@SPEC-3203 @visual` : Jour iOS/Android, Mois Android. Couvre CA-5.
- **Non-régression** — `[SPEC-3102]`, `[SPEC-3201]` si fusionnée (Aujourd'hui reflète le
  déplacement).

| Critère | Tests |
|---|---|
| CA-1 | slot-status.test, agenda-screen.test, SPEC-3203-vues.yaml |
| CA-2 | period.test, SPEC-3203-vues.yaml |
| CA-3 | filter-sheet.test, agenda.int, SPEC-3203-filtre.yaml |
| CA-4 | agenda.int, SPEC-3203-replanifier.yaml |
| CA-5 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3203/` : `acceptance.md`, rapports, vidéos, captures et comparaisons.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3203` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0029, ADR-3002, ADR-3003.
- « Replanifier » (maquette) correspond à « Déplacer » du web (BR-AGE-05) ; le réajustement global
  du planning reste sur le web.
