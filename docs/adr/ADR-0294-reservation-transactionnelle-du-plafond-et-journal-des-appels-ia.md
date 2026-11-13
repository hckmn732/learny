# ADR-0294 — Réservation transactionnelle du plafond et journal des appels IA

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-507, ADR-0012, ADR-0073

## Contexte

BR-IA-07 impose un plafond quotidien de 1,50 USD par apprenant, une bascule sur Haiku au plafond
et le report de la conception de programme. CL-5 exige que deux appels simultanés ne contournent
pas ce plafond. Le journal `ai_calls` ne contient que les appels terminés : entre l'estimation et
l'écriture du coût réel, deux appels peuvent lire la même dépense et dépasser le plafond.

## Décision

1. Une table de service `ai_budget_reservations` enregistre un bail de 15 minutes par appel
   autorisé. `reserveBudget` lit la dépense réelle (`ai_spend_today`), la somme des baux actifs et
   insère le sien dans la même transaction, sous `pg_advisory_xact_lock` du couple
   apprenant/jour. Un bail expiré est ignoré, jamais attendu.
2. Le bail est consommé avec la ligne `ai_calls` dans une transaction ; un rejeu portant le même
   identifiant de réservation renvoie la ligne existante au lieu d'en créer une seconde.
3. Au plafond, le programme est reporté avec une ligne `ai_calls` de statut `capped`, un coût nul
   et une notification `ai_task_failed` dédupliquée par jour local. Les autres tâches reçoivent un
   bail Haiku explicite, même au-delà du plafond : la bascule est visible et bornée, jamais
   silencieuse. Les appels Haiku déjà en cours restent autorisés.
4. Les notifications de coût utilisent des clés de déduplication `ai_cost_alert:<jour>` et
   `ai_programme_deferred:<jour>` ; la contrainte unique `(user_id, dedupe_key)` rend la reprise
   idempotente.
5. Le coût par défaut d'une session `@learny/llm` utilise `packages/config/src/pricing.ts` ; une
   clé personnelle ou un modèle sans tarif écrit `0.000000` avec `priced=false`, sans inventer de
   prix fournisseur.

## Conséquences

Le plafond est vérifié avant l'appel et constaté après ; une panne laisse au plus un bail expirer
en 15 minutes. Les tables de réservation restent invisibles au client (RLS sans politique
`authenticated`) et ne contiennent ni secret ni contenu d'apport.
