# ADR-0311 — Contrats et transitions de la gestion des formations

- **Statut** : Acceptée
- **Origine** : Déduite (décision prise pendant l’implémentation de SPEC-618, selon `docs/engineering/sdd-process.md` §4)
- **Date** : 2026-11-13
- **Liens** : SPEC-618, ADR-0016, ADR-0075

## Contexte

SPEC-618 exige la limite de trois formations actives, la pause avec gel des créneaux, la reprise replanifiée depuis le jour local, l’archivage et une formation courante persistée. Les documents ne fixent pas le contrat exact du dialogue de limite, la réponse d’une reprise refusée, ni la manière de replanifier sans dupliquer SPEC-407/411.

## Décision

- La reprise d’une quatrième formation sans choix explicite répond **200** avec `outcome: "limit"` et l’état à jour ; aucune écriture n’a lieu. Le dialogue propose les trois formations actives ; la confirmation renvoie `pauseFormationId` et la transaction met en pause la formation choisie avant de reprendre la cible. Un choix devenu obsolète répond **409 CONFLICT**.
- Les transitions sont sérialisées par un verrou consultatif `formations:<user_id>` ; la limite est comptée dans la transaction. Une seconde demande identique est un no-op sans second événement.
- La pause annule tous les créneaux `planned` dont le début est futur (une activité commencée reste consultable). L’archive fait de même et conserve l’historique.
- La reprise réutilise `planSchedule` (SPEC-407) et la réconciliation de `persistPlan` (SPEC-411) dans la même transaction que le changement de statut. Le volume d’un module non renseigné vaut 2 h ; la date de fin absente prend un horizon de 120 jours.
- Les événements `formation/paused` et `formation/resumed` sont émis après commit. Le repli de la formation courante suit `last_opened_at`, puis `created_at`, sinon `null`.

## Conséquences

Le client ne devine jamais l’état après une transition : chaque réponse porte l’état complet. La limite reste garantie sous concurrence et les tests peuvent vérifier les gels et la replanification sans service externe.
