# ADR-0281 — Compléments d'implémentation de la série et des jalons

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-409, ADR-0033, ADR-0047, ADR-0140

## Contexte

SPEC-409 fixe la sémantique de la série et des jalons, mais son contrat ET-1 abrège la signature de
`calculateStreak` sans le paramètre `params`, alors que §14 interdit à la fonction pure d'importer
`packages/config` et demande aux services de transmettre les paramètres métier. La spécification ne
tranche pas non plus l'ordre des 14 cases, le statut d'un jour de référence encore en cours, ni
l'encodage des clés de jalons utilisées par la persistance.

## Décision

1. `calculateStreak` reçoit un objet explicite comprenant `params` (`readingMinSeconds`,
   `regularityDays`, `maxLookbackDays`) en plus des entrées d'ET-1. Les appelants transmettent
   `ENGINE.streak` via `services` ou la démonstration ; le module `src/streak` n'importe jamais
   `@learny/config`, ce qui garantit la pureté et la déterminisme exigés par §14.
2. `calendar` est ordonné du jour local le plus ancien au jour de référence (le jour de référence
   en dernier), comme la régularité provisoire du menu (SPEC-304). Une activité qualifiante rend le
   jour `studied` même s'il est couvert par une pause. Un jour de pause ou hors rythme est `neutral`.
   Un jour prévu passé sans activité est `missed`. Le jour de référence prévu sans activité est
   `neutral` tant qu'il n'est pas terminé (CL-1) ; le parcours de série ne le casse pas et compte les
   jours précédents.
3. Une activité est un instant (`at`), un type (`kind`) et, pour la lecture seulement, une durée
   facultative (`durationSeconds`). La lecture est qualifiante à partir de `readingMinSeconds`
   (300 s) ; une durée absente vaut zéro. Les activités, les jours d'étude et les pauses sont triés,
   dédupliqués et fusionnés sans muter les entrées ; une activité dont le jour local dépasse le jour
   de référence est ignorée.
4. Les jalons ont des clés stables `module_validated:<moduleId>`, `notions_100` et `streak_30`.
   `detectMilestones` reçoit les clés déjà attribuées, déduplique modules et clés, et rend uniquement
   les nouvelles occurrences, dans l'ordre modules triés puis notions puis série. `masteredNotions`
   est le nombre de notions ayant déjà atteint le seuil de maîtrise fourni par `ENGINE.milestones`.

## Conséquences

Les services de SPEC-411 persistent directement les clés retournées. Les tests de SPEC-409 couvrent
les frontières de seuil, les changements d'heure, l'ordre des cases et l'absence de doublon au
recalcul. Aucune valeur produit n'est introduite : les bornes restent celles de `ENGINE`.
