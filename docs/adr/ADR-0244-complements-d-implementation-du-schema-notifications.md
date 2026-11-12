# ADR-0244 — Compléments d'implémentation du schéma notifications

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-109, ADR-0031, ADR-0112, ADR-0214, ADR-0047

## Contexte

SPEC-109 doit rendre la déduplication atomique (EF-2, CL-1 à CL-3), empêcher un href externe (ET-2, CL-4), garantir la cohérence et la monotonie des états de livraison (EF-3, ET-5, CL-5) et répartir la RLS entre les notifications modifiables par leur propriétaire et le journal de livraison écrit par le service (ET-4, ADR-0112, ADR-0214). Le modèle de données §8 ne fixe ni les bornes de titre et de texte, ni l'unicité du journal par canal, ni la forme d'une erreur sûre.

## Décision

Le journal est unique par (notification_id, channel) : createDelivery insère en on conflict do nothing puis relit, ce qui rend un événement rejoué idempotent même sous deux workers concurrents. La déduplication de la boîte reste unique(user_id, dedupe_key), les clés nulles demeurant distinctes par le comportement Postgres par défaut ; createNotification insère en on conflict do nothing puis relit, sans jamais réécrire read_at. Un href doit commencer par un seul / et ne contenir ni espace, ni barre oblique inverse, ni caractère de contrôle, ce qui interdit schéma, URL protocol-relative et javascript: ; la base et Zod appliquent la même règle. Les bornes title ≤ 120 et body ≤ 400 reprennent le contrat de SPEC-209 ET-2, dedupe_key ≤ 200, icon est un slug minuscule. Le statut sent équivaut exactement à sent_at non nul, scheduled et deferred_quiet exigent scheduled_for, et error est réservé à failed/skipped_pref sous forme de code sûr ^[a-z][a-z0-9_]{0,63}$. Un déclencheur refuse qu'une livraison sent change de statut, que sent_at soit réécrit ou que notification_id/channel changent. La RLS donne all au propriétaire sur notifications et select seul sur notification_deliveries, dont les écritures passent par serviceDb (SPEC-209). createdAt reste optionnel dans le repository afin que l'appelant injecte l'horloge ADR-0047 ; la valeur par défaut reste now() en base.

## Conséquences

Deux créations concurrentes avec la même clé produisent une notification et au plus une livraison par canal, sans réinitialiser la lecture ; la suppression du compte emporte la boîte et le journal. Une page de démonstration SDD affiche deux non-lues, un digest lu et des livraisons sent, deferred_quiet et skipped_pref sans aucune adresse. SPEC-209 réutilise ces tables et ces repositories sans redéfinir les contraintes ; SPEC-113 auditera la matrice RLS complète.
