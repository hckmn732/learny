# ADR-3007 — Notifications push natives par FCM et APNs

- **Statut** : Acceptée — complète ADR-0055 et ADR-1004
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-0031, ADR-0055, ADR-1004, ADR-2006, ADR-2015, ADR-3001, SPEC-3501

## Contexte

Le canal push actuel est le Web Push (VAPID, ADR-0055, SPEC-205), routé par le service unifié de
notifications (SPEC-209 : préférences, heures calmes, plafond quotidien). Les applications
natives exigent APNs (iOS) et FCM (Android). Le service Expo Push simplifierait l'envoi mais
ajouterait un sous-traitant hors de l'Union européenne qui voit le contenu des notifications, en
tension avec BR-PLA-04 et le registre des traitements (BR-PLA-05). Après CP-23, les notifications
sont envoyées par le worker Python sur outbox (ADR-2006).

## Décision

1. Le mobile obtient le **jeton natif** de l'appareil (`expo-notifications`
   `getDevicePushTokenAsync` : jeton APNs sur iOS, jeton FCM sur Android) ; le service Expo Push
   n'est pas utilisé.
2. Le contrat évolue de façon rétrocompatible : `POST /me/push-subscriptions` accepte, en plus de
   la forme Web Push existante, `{ kind: "apns" | "fcm", token, deviceName? }` (`kind` absent =
   `"webpush"`) ; `DELETE /me/push-subscriptions` accepte un jeton natif.
3. Le worker Python ajoute deux canaux : `apns` (HTTP/2, authentification par jeton JWT ES256 avec
   la clé `.p8`, `httpx[http2]` et PyJWT déjà retenus par ADR-2015) et `fcm` (API HTTP v1,
   jeton OAuth du compte de service, `google-auth`). Routage, préférences, heures calmes et
   plafond du service unifié s'appliquent sans changement ; un jeton invalide (`410`/`Unregistered`
   APNs, `UNREGISTERED` FCM) supprime l'abonnement comme 404/410 en Web Push ; cinq échecs
   consécutifs aussi (même règle que SPEC-205).
4. La charge contient le titre, le texte et l'identifiant de destination (route de
   l'application), comme le Web Push ; aucune autre donnée personnelle.
5. En mode test (`PUSH_MODE=mock`), les canaux natifs écrivent dans la même boîte de
   démonstration que le Web Push simulé.
6. Réalisé en phase P35, après CP-23 (ADR-3001 §4), dans le backend Python.

## Conséquences

- Secrets serveur nouveaux : `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_TOPIC`,
  `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` ; jamais dans le dépôt.
- La dépendance Python `google-auth` s'ajoute à la liste d'ADR-2015.
