# SPEC-3203 — Agenda jour, semaine, mois et replanification

- **Branche** : `spec/SPEC-3203-agenda` (base `mobile` + `spec/SPEC-3203`), worktree `/root/wt/SPEC-3203`.
- **Plateforme de validation** : émulateur Android 15 / API 35 (ADR-3004 § 6) ; iOS non exécutable
  ici (pas de macOS).
- **Décisions et écarts** : § 15 de la spécification ; ADR-0029 (le mobile ne planifie rien),
  ADR-3002 (périmètre compagnon), ADR-3003 (§ 3 chrome natif, § 4 comparaison visuelle).

## Critères d'acceptation

| Critère | Preuve |
|---|---|
| CA-1 ✅ Vue Jour du 11 novembre : quatre activités aux heures, titres et statuts de la maquette, ligne de l'heure à 13:20 | `src/features/agenda/slot-status.test.ts` (fenêtres « Faire » / « Dans 40 min ») ; `test/agenda/agenda-screen.test.tsx` (titres, heures, puces, `agenda-now-line` à 13:20) ; flux Maestro `SPEC-3203-agenda` (assertions texte + `agenda-now-line`) |
| CA-2 ✅ Semaine et Mois s'affichent ; toucher un jour ouvre sa vue Jour | `src/features/agenda/period.test.ts` (semaines lundi-dimanche, grille de 42 cases, bornes) ; `test/agenda/agenda-screen.test.tsx` (`agenda-week-day-*`, `agenda-month-*` → `setParams` `vue=jour`) ; flux Maestro (semaine → jour → mois → jour) |
| CA-3 ✅ Le filtre par formation restreint les activités ; un filtre sans activité affiche l'état vide | `test/agenda/filter-sheet.test.tsx` ; `test/agenda/agenda-screen.test.tsx` (état `agenda-empty`) ; `test/integration/agenda.int.test.ts` (filtre réel + formation sans créneau, « Anglais professionnel B2 ») ; flux Maestro (`Anglais professionnel B2` → `agenda-empty`) |
| CA-4 ✅ « Replanifier » propose 3 créneaux, le déplacement est visible dans l'agenda et dans Aujourd'hui | `test/agenda/replan-sheet.test.tsx` (trois propositions, confirmation, clé d'idempotence, conflit 409) ; `test/integration/agenda.int.test.ts` (alternatives réelles, `POST /slots/:id/move`, agenda relu, remise en place) ; flux Maestro (option → confirmation → toast) |
| CA-5 ⚠️ Vues Jour et Mois conformes à la maquette (écart ≤ 12 %) : **écart mesuré 21,6 %**, imputable aux données de démonstration (voir ci-dessous), donc **critère non atteint** en l'état | flux `@SPEC-3203 @visual` : capture `SPEC-3203-agenda-jour` comparée à `android-07-agenda.png`, capture du mois jointe ; comparaison dans `test-results/sdd/SPEC-3203/e2e-mobile.json` |

## Livré

- `src/features/agenda/period.ts` : périodes civiles (jour, semaine lundi-dimanche, mois de 42
  cases), bornes de navigation, heure et jour lus dans le fuseau de l'utilisateur.
- `src/features/agenda/slot-status.ts` : puces de statut de BR-AGE-04 et mise en avant de la
  maquette (carte encre de l'activité imminente, point citron de la suivante).
- `src/data/use-agenda.ts` : `useAgenda` (clé `['agenda', from, to, formation]`),
  `useSlotAlternatives`, `useMoveSlot` (mutation idempotente puis invalidation de `['agenda']` et
  `['home']`) ; `slotAlternatives` ajoutée à `src/data/keys.ts`. La clé d'idempotence est forgée
  par `useIdempotencyKey` (registre + `uuidV4` maison) et passée explicitement : le défaut produit
  de `crypto.randomUUID()` absent sur Hermes release ne touche donc pas le déplacement.
- `src/features/agenda/AgendaScreen.tsx` et les composants `DayStrip`, `DayTimeline`, `SlotCard`,
  `WeekList`, `MonthGrid`, `SelectedActivityCard`, `FormationFilterSheet`, `LegendSheet`,
  `ReplanSheet`, `open-target` ; `app/(app)/agenda/index.tsx` monte l'écran (paramètres `vue`,
  `date`, `formation` dans l'URL) ; en-tête sous la barre d'état (`useSafeAreaInsets`).
- Libellés mobiles dans `packages/i18n/src/fr/mobile.ts` (espace `agenda`) ; les libellés communs
  au web (`Agenda`, vues, « Ouvrir », totaux) sont importés de `fr.agenda`.
- Tests : 2 fichiers Vitest `[SPEC-3203]` (17 tests), 3 fichiers Jest/RNTL `[SPEC-3203]`
  (16 tests), 1 fichier d'intégration (3 tests), 1 flux Maestro `@SPEC-3203 @visual` avec vidéo.
- `src/lib/dates.ts` : formats de jour civil (`civilDayLong`, `civilDayShort`, `civilDayMonth`,
  `civilMonthYear`, `civilDayNumber`) sans passer par un instant.

## Non livré / limites

- iOS : aucun simulateur sur cette plateforme ; la comparaison visuelle porte sur l'export Android.
- « Ouvrir » (EF-6) : les écrans de cours, de quiz de validation et de quiz global arrivent avec
  SPEC-3302, SPEC-3304 et SPEC-3305. Tant qu'ils n'existent pas, les quatre types ouvrables et les
  autres types passent par la page web du créneau (`slot.href`, calculé côté serveur) ; le point
  d'extension est `src/features/agenda/open-target.ts` (seules les activités ouvrables portent le
  lien, jamais une marge ni un apport).
- « Déplacé » (BR-AGE-04) : le contrat `AgendaSlot` n'expose que `planned | done | missed` ; le
  statut `moved` reste côté serveur, la puce « Déplacé » n'est donc jamais rendue.

## Écart de données de démonstration (CA-5, non atteint en l'état)

La capture de référence `design/app-mobile/exports/screens/android-07-agenda.png` montre quatre
cartes (Relecture, Échauffement, Quiz de validation, Quiz global). Le jeu de démonstration du
11 novembre contient un cinquième créneau (`buffer`, « Marge de remédiation », 15:00) **et des
libellés différents** (`Relecture ciblée` au lieu de `Relecture du cours`, méta `Chapitre 2 et
lacunes · fait`), donc toutes les cartes situées sous la première diffèrent aussi par leur texte.

Comparaison mesurée (masque par défaut d'ADR-3003 § 4, chrome système masqué) : **21,6 %**.
Aucun masque de contenu n'est appliqué (aucun ADR ne couvre cette zone) ; le ratio reste donc
supérieur au seuil de 12 %. Deux sorties possibles, à trancher par le porteur : (a) aligner le jeu
de démonstration sur la maquette (retirer la marge du 11 novembre et rétablir les libellés), ou
(b) assumer l'écart de données et relever le seuil pour ce flux.
