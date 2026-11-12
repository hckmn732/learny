# ADR-0265 — Canaux, données et réservation du plafond du service de notifications

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-209, ADR-0214, ADR-0031, ADR-0266

## Contexte

ADR-0214 fixe l'ordre des contrôles et la correspondance type → préférence, mais SPEC-209 laisse trois points ouverts : les canaux réellement applicables au programme du jour et à l'export, la conservation des données d'un gabarit (`data`) lorsque l'envoi est reporté, et le comptage du plafond quand l'envoi effectif a lieu après le commit. Le schéma de SPEC-109 ne porte ni `stale_at` ni `data`, et aucune migration fusionnée ne doit être modifiée.

## Décision

`channelsOf(type)` décide des canaux : `daily_digest` n'utilise que l'e-mail (EF-6, aucune ligne push), `export_ready` n'utilise que le navigateur (l'e-mail d'export est envoyé directement par SPEC-211, ET-7), tous les autres types utilisent les deux canaux. La notification in-app est créée dans tous les cas.

Le plafond réserve la place au moment de la transaction : `countSentNotifications` compte les notifications distinctes dont une livraison est `sent` ou `scheduled` à échéance immédiate (donc déjà réservée), hors `daily_digest`. Cette réservation, prise sous `pg_advisory_xact_lock(hashtext(user_id))`, garantit qu'aucun envoi concurrent ne dépasse `max_per_day` même si le transport s'exécute après le commit ; une livraison `failed` libère sa place puisqu'elle ne compte plus.

L'événement `notification/delivery-due` porte, en plus du `deliveryId`, les `data` du gabarit. L'envoi immédiat après commit utilise ces données en mémoire ; un rejeu par la boîte d'envoi les retrouve dans l'événement. Une livraison reportée est réévaluée depuis la base : la notification lue ou `staleAt` dépassé la fait passer `skipped_pref` avec `error = 'stale'`. `staleAt` ou `data` ne sont jamais persistés dans `notifications` ni dans `notification_deliveries`, ce qui évite une migration et préserve les colonnes figées de SPEC-109.

## Conséquences

SPEC-209 ajoute l'événement `notification/delivery-due` au catalogue. Les producteurs continuent d'appeler uniquement `notify`. Les tests de concurrence comptent les notifications réservées, et un échec de transport ne consomme pas le plafond.
