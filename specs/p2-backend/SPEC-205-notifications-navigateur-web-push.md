---
id: SPEC-205
title: Notifications navigateur (Web Push)
phase: P2
priority: V1
depends_on: [SPEC-203, SPEC-109]
business_rules: [BR-NOT-03]
screens: []
adrs: [ADR-0055]
visual: demo
---

# SPEC-205 — Notifications navigateur (Web Push)

## 1. Objectif

Permettre à l'apprenant d'autoriser ou retirer les notifications du navigateur, puis d'envoyer un Web Push standard avec VAPID. Les abonnements expirés ou définitivement invalides sont nettoyés, sans désactiver le canal in-app.

## 2. Contexte

BR-NOT-03 impose application toujours active, e-mail et navigateur avec permission demandée. ADR-0055 choisit `web-push` et supprime les abonnements après 404/410 ou cinq échecs. SPEC-102 crée `push_subscriptions` et réglages ; SPEC-109 crée le journal de livraison ; SPEC-203 fournit les jobs durables. Lire `docs/architecture/api.md` §2, `docs/architecture/data-model.md` §1/§8, `docs/engineering/conventions.md` §4 et §9, SPEC-204 pour les canaux e-mail et SPEC-209 pour le routage unifié.

## 3. Dépendances

- **SPEC-203** : événement/handler de notification et reprise des erreurs temporaires.
- **SPEC-109** : `notification_deliveries` pour l'état réel d'un envoi.
- **SPEC-102** : `push_subscriptions`, `notification_settings.channel_push`.
- **SPEC-009** : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` et `PUSH_MODE` ; aucune clé privée dans le navigateur.
- **Bibliothèque** : `web-push` selon ADR-0055, service worker du web. En test, `PUSH_MODE=mock` et aucun fournisseur réel n'est appelé.

## 4. Règles métier couvertes

- **BR-NOT-03** : la permission du navigateur est demandée après action explicite de l'apprenant ; les notifications in-app restent disponibles si la permission est refusée ou l'abonnement absent. Le canal e-mail est traité séparément par SPEC-204/209.

## 5. Exigences fonctionnelles

- **EF-1** — `POST /api/v1/me/push-subscriptions` exige une session et un objet PushSubscription valide (`endpoint` HTTPS, clés `p256dh` et `auth`), puis crée ou met à jour l'abonnement de l'utilisateur. Le même endpoint ne peut pas appartenir à deux comptes.
- **EF-2** — `DELETE /api/v1/me/push-subscriptions` retire l'abonnement du navigateur courant de l'utilisateur ; une suppression répétée est idempotente. La route ne révèle pas si un endpoint d'autrui existe.
- **EF-3** — Le client appelle `Notification.requestPermission()` seulement après clic sur « Activer les notifications du navigateur », puis enregistre le service worker et `pushManager.subscribe` avec la clé VAPID publique. Permission `denied` → message et réglage visible, sans répétition automatique de la demande.
- **EF-4** — Le service worker traite `push` et `notificationclick` : affiche titre/corps/icône sûrs, ouvre ou focalise une URL interne autorisée, et ignore une URL externe ou mal formée. La notification n'inclut aucun apport, cours, clé ou contenu personnel sensible.
- **EF-5** — `sendPush(userId, notification)` récupère les abonnements actifs, appelle `web-push` avec VAPID côté serveur et écrit `sent`/`failed` dans `notification_deliveries`. 404 ou 410 supprime immédiatement l'abonnement ; autre échec incrémente `failure_count` et supprime à cinq. Un succès remet le compteur à zéro et renseigne `last_success_at`.
- **EF-6** — `PUSH_MODE=mock` conserve un outbox de test déterministe et simule succès, 404, 410 ou erreur transitoire sans réseau. `PUSH_MODE=live` est refusé en CI.
- **EF-7** — La page SDD permet de simuler permission `default`/`granted`/`denied`, abonnement et réception fictive ; elle ne déclenche aucune demande réelle de permission pendant le test visuel.

## 6. Exigences techniques

- **ET-1** — Contrats Zod dans `packages/contracts/src/push.ts` ; routes via `handler` de SPEC-201, auth obligatoire, limitation et erreur `problem+json`. Le `POST` est idempotent sur endpoint/propriétaire.
- **ET-2** — `packages/notifications/src/push/send.ts` encapsule `web-push` et l'outbox mock. Le secret VAPID est lu via `@learny/config/server`, jamais importé dans un composant client ou le service worker.
- **ET-3** — Valider `endpoint` contre SSRF côté enregistrement (schéma HTTPS, hôte public, longueur bornée) et ne pas suivre de redirection lors d'un envoi. Le fournisseur push reçoit seulement le payload minimal nécessaire.
- **ET-4** — `apps/web/public/sw.js` (ou fichier de génération équivalent) ne met en cache aucun secret et vérifie que `notificationclick` navigue sur la même origine.
- **ET-5** — La suppression de l'abonnement et le journal de livraison ont lieu dans une transaction pour les statuts définitifs ; les erreurs transitoires restent éligibles à la reprise de SPEC-203.
- **ET-6** — Un test d'intégration inspecte les octets du bundle service worker/client pour confirmer l'absence de `VAPID_PRIVATE_KEY`.

## 7. Comportements attendus et cas limites

- **CL-1** — Permission refusée : aucun abonnement enregistré, in-app toujours disponible.
- **CL-2** — Navigateur sans `PushManager` : bouton désactivé avec explication, aucune exception JS.
- **CL-3** — Endpoint d'un autre compte : création refusée, aucune information d'existence.
- **CL-4** — Réponse push 404/410 : abonnement supprimé dès la première réponse.
- **CL-5** — Échecs non définitifs répétés : compteur 1 à 4, suppression au cinquième ; un succès intermédiaire remet à 0.
- **CL-6** — Clic sur URL externe ou `javascript:` : ignoré, aucune navigation.
- **CL-7** — Double clic Activer : un seul abonnement et une seule demande de permission.
- **CL-8** — Clé VAPID privée absente en production : validation de configuration échoue avant tout envoi.

## 8. Instructions d'implémentation

1. Définir contrats/routes et service d'abonnements avec RLS, idempotence et tests croisés. Commit `feat(SPEC-205): enregistre les abonnements push`.
2. Créer `sendPush`, outbox mock et traitement 404/410/cinq échecs. Commit `feat(SPEC-205): envoie et nettoie les notifications push`.
3. Ajouter service worker et helper client de permission/abonnement, puis page SDD simulée. Commit `feat(SPEC-205): active les notifications navigateur`.
4. Écrire tests unitaires, intégration, e2e et visuel ; valider et documenter les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/push.ts`, `packages/notifications/src/push/{send,subscriptions}.ts`, `packages/notifications/src/push/send.test.ts`, `packages/notifications/test/integration/push.test.ts`, `apps/web/app/api/v1/me/push-subscriptions/route.ts`, `apps/web/lib/push.ts`, `apps/web/public/sw.js`, `apps/web/components/sdd-demos/spec-205.tsx`, `apps/web/e2e/specs/p2/spec-205.spec.ts`.
- **Modifiés** : `packages/config/src/env.ts` si les clés VAPID manquent, `packages/contracts/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `push_subscriptions`, `notification_settings`, `notification_deliveries` et `handler`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-205` affiche « Notifications navigateur », état de permission simulée, état d'abonnement, bouton de simulation « Recevoir une notification » et journal de livraison. `data-testid` : `spec-205-permission`, `spec-205-subscription`, `spec-205-preview`, `spec-205-delivery`. Les trois permissions sont navigables au clavier, la réponse est annoncée par `aria-live` et le test visuel ne sollicite pas la vraie permission. Vérifier jetons, ordre, axe et captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — L'abonnement exige permission et session, un endpoint n'appartient qu'à un compte et le retrait est idempotent.
- **CA-2** — 404/410 nettoient immédiatement ; cinq échecs transitoires nettoient ; un succès réinitialise le compteur.
- **CA-3** — Le service worker n'ouvre qu'une URL interne et aucun secret VAPID privé n'atteint le client.
- **CA-4** — Permission refusée ou API Push absente garde le canal in-app utilisable et ne lance aucun envoi.
- **CA-5** — La démonstration simule les états, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/notifications/src/push/send.test.ts`, `describe('[SPEC-205] push delivery')` : statuts 200/404/410, cinq erreurs, reset, payload et URL sûre (CA-2, CA-3).
- **Intégration** — `packages/notifications/test/integration/push.test.ts`, `describe('[SPEC-205] push subscriptions')` : routes, deux JWT, unique endpoint, mock outbox, absence de clé privée dans bundle (CA-1, CA-3, CA-4).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-205.spec.ts`, `test('simule les permissions push @SPEC-205')` : états accord/refus, abonnement simulé et in-app, vidéo (CA-4, CA-5).
- **Visuel** — `test('push conforme @SPEC-205 @visual')` : structure, jetons, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-109]`, `[SPEC-203]` et tests de paramètres de notification existants.

| Critère | Tests |
|---|---|
| CA-1 | intégration abonnements |
| CA-2 | unitaires envoi |
| CA-3 | unitaires URL ; intégration bundle |
| CA-4 | intégration ; e2e |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-205/` contient rapports, résultats du mock 404/410/cinq échecs, vidéo/captures, `checks.json` et `acceptance.md`. Aucune clé VAPID ou endpoint réel n'est inscrit dans les preuves.

## 14. Définition de terminé

Les validations de `docs/engineering/testing.md` §7 passent ; le mode mock est déterministe, la clé privée est serveur, les abonnements invalides sont retirés et le canal in-app survit au refus de permission.

## 15. Décisions et hypothèses

ADR-0055 fixe Web Push/VAPID et nettoyage 404/410/cinq échecs. SPEC-209 choisira si et quand envoyer selon préférences, heures calmes et plafond ; cette spécification réalise le canal navigateur.
