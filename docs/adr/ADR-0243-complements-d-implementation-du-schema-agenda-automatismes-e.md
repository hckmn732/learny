# ADR-0243 — Compléments d'implémentation du schéma agenda, automatismes et série

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-108, ADR-0029, ADR-0033, ADR-0112, ADR-0113, ADR-0022

## Contexte

SPEC-108 doit rendre un déplacement traçable et unique sous concurrence (EF-2, CL-2, CL-3), protéger un jalon à référence nulle (EF-5, CL-6), additionner l'activité quotidienne sans doubler un événement rejoué (EF-4, CL-5, CA-3) et activer la RLS des quatre tables (ET-3). Le modèle de données §7 ne tranche ni le comportement de la FK auto-référente à la suppression du compte, ni l'unicité des références nulles, ni la répartition exacte des politiques entre écriture propriétaire et rôle service. automation_key existe déjà dans identity.ts (SPEC-102).

## Décision

schedule_slots.moved_from_id est une FK auto-référente on delete no action : supprimer l'origine seule échoue (23503) tandis que la cascade du compte supprime les deux lignes dans la même instruction. Un index unique partiel sur moved_from_id, limité aux statuts planned/done/missed, garantit au plus un successeur actif ; le repository verrouille l'origine (select for update) et passe l'ancien créneau en moved avant d'insérer le nouveau, et un déclencheur exige que l'origine existe, partage propriétaire et formation et soit déjà moved. milestones utilise une contrainte unique (user_id, key, ref_id) NULLS NOT DISTINCT, sans quoi streak_30 (ref_id nul) serait dupliquable. L'upsert de daily_activity est une instruction unique : il n'ajoute les minutes que si au moins une source d'événement est nouvelle, OR qualifying, et unionne les sources triées ; rejouer le même événement est donc idempotent tout en permettant à deux écritures distinctes de s'additionner. La RLS est propriétaire sur schedule_slots et daily_activity (all), en lecture et décision sur automation_actions (select et update) car la création appartient aux jobs d'automatisation, et en lecture seule sur milestones car SPEC-409 les calcule. Les écritures service passent par serviceDb. automation_key est réutilisé depuis identity.ts. L'accès à la formation n'est pas revérifié par un déclencheur : formations n'a pas encore de politique authenticated et les formations partagées arrivent avec SPEC-111 ; l'isolation personnelle repose sur user_id = auth.uid().

## Conséquences

Un déplacement concurrent obtient une réussite et un CONFLICT rejouable, sans second successeur actif ; la suppression d'un compte emporte la chaîne, l'activité, les actions et les jalons ; une relecture du même événement n'ajoute ni minute ni source ; les jalons à référence nulle restent uniques. La migration 0016_planning est complétée par 0017_planning_rules (RLS, trigger set_updated_at, cohérence de déplacement). SPEC-111 devra étendre la visibilité des formations partagées sans affaiblir l'isolation par user_id.
