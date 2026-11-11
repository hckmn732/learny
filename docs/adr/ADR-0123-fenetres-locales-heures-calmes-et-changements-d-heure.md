# ADR-0123 — Fenêtres locales, heures calmes et changements d'heure

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-203, SPEC-207, SPEC-209

## Contexte

ADR-0067 impose un cron horaire (minute 5) qui sélectionne les utilisateurs selon leur heure locale. Or le programme du jour peut être réglé à 07:30 ou 08:30 (maquette Paramètres), certains fuseaux ont un décalage à la demi-heure, et les heures calmes peuvent chevaucher minuit et les changements d'heure.

## Décision

- Chaque tick horaire de l'instant T émet, par utilisateur, une fenêtre locale `[T − 5 min, T + 55 min[` ; une heure locale configurée `HH:MM` est « due » dans la fenêtre qui contient son instant ; le consommateur attend cet instant exact (`step.sleepUntil`). La cadence reste horaire (ADR-0067).
- Conversion heure locale → instant : heure inexistante (passage à l'heure d'été) → première minute valide suivante ; heure ambiguë (passage à l'heure d'hiver) → première occurrence uniquement.
- Heures calmes `[début, fin[` en heure locale : début inclus, fin exclue ; si début > fin, la plage chevauche minuit ; si début = fin, aucune heure calme. La « fin des heures calmes » est l'instant de la prochaine occurrence locale de `fin` (règles de conversion ci-dessus).
- Week-end = samedi et dimanche (jours ISO 6 et 7) du fuseau de l'utilisateur.

## Conséquences

Les consommateurs (programme du jour, micro-séance, bilan, report des envois) utilisent `dueInWindow` et les fonctions de `packages/core/src/time.ts` ; aucun calcul d'heure locale n'est dupliqué.
