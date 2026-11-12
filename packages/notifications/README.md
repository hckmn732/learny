# @learny/notifications

Canaux du service de notifications : e-mail (SPEC-204), navigateur Web Push (SPEC-205), routage unifié (SPEC-209).

## Canal navigateur (`@learny/notifications/push`, ADR-0055)

- `upsertPushSubscription(ctx, body)` / `removePushSubscription(ctx, { endpoint })` / `listPushSubscriptions(ctx)` : abonnements du navigateur courant sous RLS ; un point de terminaison n'appartient qu'à un compte (refus neutre `FORBIDDEN`), le retrait est idempotent.
- `sendPush(sctx, { userId, notification }, { transport })` : appelle le service push pour chaque abonnement actif, puis en une transaction remet le compteur à zéro (`last_success_at`), supprime l'abonnement après 404/410 ou cinq échecs, et écrit `sent`/`failed` dans `notification_deliveries` (canal `push`). Un tour sans abonnement écrit `skipped_pref`/`no_subscription` et n'envoie rien ; un tour d'échecs transitoires est `retryable`.
- `createPushTransport({ mode, vapid, ci })` : `mock` (boîte de sortie déterministe, résultat choisi par le dernier segment de l'endpoint : `success`, `missing` → 404, `gone` → 410, `transient` → 503) ou `live` (`web-push`, VAPID côté serveur, aucune redirection suivie, refusé en CI).
- `buildPushPayload(notification)` / `safeNotificationUrl(origin, candidate)` : charge utile minimale (titre, texte, icône, chemin interne, tag) et règle d'ouverture d'une URL interne, identique à celle du service worker `apps/web/public/sw.js`.

La clé privée VAPID est lue par l'application via `@learny/config/server` et transmise au transport ; elle n'est jamais importée par un composant client ni par le service worker.
