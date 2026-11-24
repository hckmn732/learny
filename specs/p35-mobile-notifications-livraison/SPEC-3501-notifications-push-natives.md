---
id: SPEC-3501
title: Notifications push natives (FCM et APNs)
phase: P35
priority: mobile
depends_on: [SPEC-3401]
business_rules: [BR-NOT-02, BR-NOT-03, BR-NOT-04, BR-NOT-05, BR-NOT-06, BR-NOT-07, BR-SET-03]
screens: [SCR-15]
adrs: [ADR-0031, ADR-0055, ADR-2006, ADR-2011, ADR-3001, ADR-3007]
visual: mockup
---

# SPEC-3501 — Notifications push natives (FCM et APNs)

## 1. Objectif

Envoyer les notifications hors application sur les téléphones : enregistrement du jeton natif
par l'application, canaux `apns` et `fcm` dans le worker Python soumis aux mêmes règles que le
Web Push, ouverture de l'écran concerné au toucher, réglage dans Profil → Notifications.

## 2. Contexte

Phase P35 : **exige CP-23** (backend entièrement Python, ADR-3001 §4). Lire ADR-3007 (jetons
natifs, contrat, canaux, charge, mode simulé), ADR-0055 et SPEC-205 (Web Push : abonnement,
nettoyage 404/410, cinq échecs), SPEC-209 et ADR-0031 (service unifié : préférences, heures
calmes, plafond, journal), SPEC-706 (génération des rappels), ADR-2006 (worker sur outbox),
ADR-2011 et `docs/architecture/python-backend/00-conventions.md` (code Python en anglais,
motifs autorisés). Le contrat source est `api/openapi.yaml` (ADR-2004). Destinations des types :
SPEC-3102 ET-3.

## 3. Dépendances

- **SPEC-3401** (écran Notifications du profil), SPEC-3102 (liens profonds, destinations).
- CP-23 réussi et `main` fusionnée dans `mobile` (`node tools/sdd/sync-main.mjs`).
- `expo-notifications` ; côté Python : `httpx[http2]`, PyJWT (ADR-2015), `google-auth` (ADR-3007).
- Identifiants APNs (clé `.p8`) et FCM (compte de service) fournis par le porteur, configurés dans
  EAS et dans les secrets du worker ; sans eux, tout est livré et prouvé en `PUSH_MODE=mock`, puis
  `fail.mjs SPEC-3501 "identifiants APNs/FCM absents" --external` pour l'essai réel.

## 4. Règles métier couvertes

- BR-NOT-02 — Chaque type de notification envoyé en push porte sa destination (route de
  l'application) ; le toucher ouvre l'écran prévu.
- BR-NOT-03 — Le canal « notification du navigateur » s'étend aux appareils mobiles
  (« Notifications de l'appareil ») ; la permission système est demandée au moment utile
  (activation du canal ou première séance planifiée), jamais au premier lancement.
- BR-NOT-04 — Valeurs par défaut identiques : canal appareil activé une fois la permission
  accordée, tous les types activés.
- BR-NOT-05 — Le plafond quotidien hors application compte les envois natifs avec l'e-mail et le
  Web Push.
- BR-NOT-06 — Heures calmes : aucun push natif, report à la fin de la plage.
- BR-NOT-07 — Le rappel de quiz de validation 40 minutes avant part aussi en push natif.
- BR-SET-03 — L'interrupteur du canal appareil apparaît dans Profil → Notifications ; le
  désactiver supprime l'abonnement de l'appareil.

## 5. Exigences fonctionnelles

- **EF-1** — Application : fonction `registerDevicePush()` (demande de permission, jeton natif,
  `POST /me/push-subscriptions` `{ kind: "apns" | "fcm", token, deviceName }`), appelée à
  l'activation du canal et à chaque démarrage si la permission est accordée (jeton renouvelé) ;
  `DELETE` à la désactivation et à la déconnexion.
- **EF-2** — Toucher une notification (application fermée, en arrière-plan ou au premier plan)
  ouvre la route de destination après la garde d'authentification ; au premier plan, une
  bannière interne s'affiche au lieu de la notification système.
- **EF-3** — Contrat : `api/openapi.yaml` étend le corps de `POST /me/push-subscriptions` (union
  discriminée par `kind`, `webpush` par défaut) et de `DELETE` ; aucune autre opération ne change ;
  le contrôle de compatibilité (ADR-2004) passe.
- **EF-4** — Données : colonnes `kind` (`webpush` par défaut), `token`, `platform` ajoutées à
  `push_subscriptions` par migration additive (RLS existante inchangée ; unicité par
  `(user_id, kind, token)`).
- **EF-5** — Worker Python : canaux `apns` et `fcm` enregistrés à côté de `webpush` dans le
  routage du service de notifications ; envoi, traitement des réponses (suppression sur jeton
  invalide, compteur d'échecs), journal des livraisons.
- **EF-6** — `PUSH_MODE=mock` : les envois natifs sont enregistrés dans la boîte de
  démonstration existante et visibles par la page de démonstration push.
- **EF-7** — Notifications Android : canal système « Rappels Learny » (importance élevée), icône
  monochrome ; iOS : son par défaut, pas de badge numérique en V1.

## 6. Exigences techniques

- **ET-1** — Python (anglais, ADR-2011) : `learny/notifications/channels/apns.py` et `fcm.py`
  (noms à aligner sur l'arborescence réelle du domaine après CP-23), ports et adaptateurs selon
  `00-conventions.md`, horloge injectable, secrets via la configuration typée.
- **ET-2** — APNs : HTTP/2 vers `api.push.apple.com` (ou `api.sandbox.push.apple.com` selon
  l'environnement), jeton JWT ES256 renouvelé toutes les 50 min ; FCM : `projects/<id>/messages:send`,
  jeton OAuth mis en cache jusqu'à expiration.
- **ET-3** — Idempotence : un envoi par (livraison, abonnement) ; une reprise du worker ne
  produit pas de doublon (clé de livraison existante).
- **ET-4** — Aucun jeton d'appareil ni contenu de notification dans les journaux en clair
  (masquage).

## 7. Comportements attendus et cas limites

- **CL-1** — Permission refusée : l'interrupteur du canal appareil reste désactivé avec « Autoriser
  dans les réglages » (ouvre les réglages système) ; aucun abonnement créé.
- **CL-2** — Jeton invalide renvoyé par APNs ou FCM : abonnement supprimé, livraison marquée
  échouée, aucun nouvel essai sur ce jeton.
- **CL-3** — Même appareil réinstallé (nouveau jeton) : le nouvel abonnement remplace l'ancien à
  la prochaine inscription ; l'ancien est nettoyé à la première erreur.
- **CL-4** — Notification vers un contenu supprimé : comportement de SPEC-3102 CL-1.
- **CL-5** — Heures calmes ou plafond atteint : aucun envoi natif, report ou résumé selon SPEC-209.

## 8. Instructions d'implémentation

1. Fusionner `main` (après CP-23) ; lire l'arborescence Python réelle du domaine notifications.
2. Contrat (`api/openapi.yaml`), modèles générés, migration additive, tests de compatibilité.
3. Canaux Python et tests pytest (simulations HTTP), branchement au routage.
4. Client : permission, jeton, inscription, désinscription, gestion du toucher, interrupteur.
5. Tests d'intégration bout en bout en mode simulé, Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — canaux Python et leurs tests (`packages-py/learny/...`), migration SQL additive,
  `apps/mobile/src/notifications/{register,handlers}.ts`, tests,
  `apps/mobile/e2e/flows/SPEC-3501-*.yaml`.
- **Modifiés** — `api/openapi.yaml`, modèles générés, configuration du worker, routage du service
  de notifications, `apps/mobile/src/features/profil/notifications*`, `apps/mobile/app.config.ts`,
  `docs/architecture/api.md` (ligne de l'inventaire), `docs/architecture/data-model.md`.
- **Lus** — SPEC-205, SPEC-209, SPEC-706, `00-conventions.md`.

## 10. Interface et conformité visuelle

Mode `mockup` : Profil → Notifications reprend les jetons et la structure de
`design/app-mobile/` (écran de réglages de la planche, feuille « Notifications » du prototype) ;
la racine Profil reste conforme à `ios-08-profil.png` (non-régression visuelle). `testID` :
`notifications-device-switch`, `notifications-permission-cta`, `push-banner`. La notification
système elle-même n'est pas comparée visuellement (rendu du système).

## 11. Critères d'acceptation

- **CA-1** — Activer le canal appareil demande la permission, crée l'abonnement natif et
  l'interrupteur reflète l'état ; le désactiver le supprime.
- **CA-2** — Un rappel de quiz de validation simulé (`PUSH_MODE=mock`) produit une livraison
  native respectant heures calmes et plafond ; hors heures calmes, il est envoyé, pendant, il est
  reporté.
- **CA-3** — Toucher la notification (envoyée en local sur l'émulateur avec la même charge) ouvre
  l'écran du quiz.
- **CA-4** — Un jeton invalide supprime l'abonnement ; aucune livraison en double après reprise du
  worker.
- **CA-5** — Le contrôle de compatibilité du contrat et la suite pytest du domaine notifications
  passent ; aucune régression Web Push.

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3501]` `notifications/register.test.ts`,
  `notifications/handlers.test.ts` ; Jest `[SPEC-3501]` `notifications-settings-device.test.tsx` ;
  pytest `[SPEC-3501]` canaux APNs et FCM (réponses simulées, jetons invalides, JWT, cache OAuth).
  Couvre CA-1, CA-3, CA-4.
- **Intégration** — Vitest `[SPEC-3501]` `test/integration/push.int.test.ts` et pytest
  `[SPEC-3501]` : inscription, désinscription, livraison simulée, heures calmes, plafond,
  idempotence du worker. Couvre CA-2, CA-4, CA-5.
- **End-to-end** — Maestro `@SPEC-3501` (vidéo) : `SPEC-3501-activation.yaml` (permission
  accordée sur l'émulateur, interrupteur), `SPEC-3501-toucher.yaml` (notification locale de même
  charge, ouverture du quiz). Couvre CA-1, CA-3.
- **Visuel** — `@SPEC-3501 @visual` : écran Notifications du profil et racine Profil. Couvre CA-1.
- **Non-régression** — `[SPEC-3401]`, suites pytest notifications et Web Push, e2e web `@SPEC-205`,
  `@SPEC-209`.

| Critère | Tests |
|---|---|
| CA-1 | register.test, notifications-settings-device.test, SPEC-3501-activation.yaml |
| CA-2 | push.int, pytest intégration |
| CA-3 | handlers.test, SPEC-3501-toucher.yaml |
| CA-4 | pytest canaux, pytest intégration |
| CA-5 | contrôle de compatibilité, pytest, e2e web |

## 13. Preuves attendues

`evidence/SPEC-3501/` : `acceptance.md`, rapports Vitest, Jest et pytest, vidéos, captures,
extrait de la boîte de démonstration push (jetons masqués), résultat du contrôle de
compatibilité ; essai réel sur appareil si les identifiants sont fournis.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 et, pour la partie Python, par ADR-2008 et ADR-2011 ;
`validate.mjs SPEC-3501` vert ; blocage `--external` consigné pour l'essai réel si les identifiants
manquent.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0031, ADR-0055, ADR-2006, ADR-2011, ADR-3001, ADR-3007.
- Pas de badge numérique d'icône en V1.
