# Correspondance des tests portés — SPEC-2205 (engagement)

Source : `evidence/SPEC-2001/test-port-map.md` et les fichiers de test TypeScript du périmètre
notifications. Chaque cas est rejoué par un test pytest au nom unique ; les tests qui dépendent de la
base ou du réseau TypeScript (Supabase local) passent par l'intégration serveur, jamais par un mock
de la couche de données.

## Domaine pur (déjà committé)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `packages/notifications/src/routing.test.ts` | préférences, heures calmes, week-end, plafond, `eligibleAt`/`staleAt` | `tests/unit/engagement/test_engagement_domain.py` (oracle `tools/engagement/oracle.mjs`) |
| `packages/notifications/src/templates/templates.test.ts` | seize gabarits × deux tonalités, bornes, `href` | idem |

## Plateforme (e-mail, push, désinscription)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `src/email/unsubscribe-token.test.ts` | vecteurs du jeton, altération, mauvaise longueur, identifiant invalide | `tests/unit/engagement/test_engagement_platform.py` (vecteurs produits par le TS) |
| `src/email/send.test.ts` | mode `memory`, clé d'idempotence, en-têtes `List-Unsubscribe`, tonalité | idem (`MemoryEmailTransport`, `render_email`) |
| `src/email/transports/resend.test.ts` | 429/5xx transitoires, 4xx définitifs, timeout | idem (`is_transient_status`, `EmailTransientError`/`EmailRejectedError`) |
| `emails/templates.test.tsx` | sujets et textes des gabarits, deux tonalités | idem, textes assertés via `locale_fr.engagement_email` |
| `src/push/send.test.ts` | décision par abonnement (2xx, 404/410, cinquième échec), résumé de tour | idem (`decide_attempt`, `summarize_round`, `classify_push_status`) |
| `src/push/payload.ts` (couvert par `send.test.ts`) | charge utile bornée, `safeNotificationUrl` | idem (`build_push_payload`, `safe_notification_url`) + `tests/integration/engagement/test_engagement_notify.py` |
| `test/integration/push.test.ts` | suppression de l'abonnement disparu, remise à zéro du compteur | `tests/integration/engagement/test_engagement_notify.py` |

## Services (inbox, réglages, abonnements, désinscription)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `packages/services/src/notifications/list.test.ts` | groupes `today`/`yesterday`/`earlier`, compteurs, filtre non lu, pagination | `tests/integration/engagement/test_engagement_inbox.py` |
| `packages/services/src/notifications/list.service.test.ts` | marquage lu idempotent, 404 sur une notification étrangère, `read-all` | idem |
| `packages/services/src/parametres-notifications.test.ts` | DTO normalisé, patch partiel, `expectedUpdatedAt` → 409, compteur des six types, heures calmes | `tests/integration/engagement/test_engagement_settings.py` + `tests/unit/engagement/test_engagement_platform.py` |
| `src/push/subscriptions.test.ts` (couvert par `test/integration/push.test.ts`) | création, rafraîchissement, endpoint étranger `FORBIDDEN`, suppression idempotente | `tests/integration/engagement/test_engagement_push_subscriptions.py` |
| `packages/services/src/email/unsubscribe.test.ts` | jeton valide → canal coupé, jeton altéré → 400, compte supprimé → lien expiré | `tests/integration/engagement/test_engagement_unsubscribe.py` |
| `test/integration/notify.test.ts` | dédup `(user, dedupe_key)`, un seul effet par événement, plafond sous verrou, heures calmes, envoi après commit | `tests/integration/engagement/test_engagement_notify.py` |
| `test/integration/email.test.ts` | message capturé une fois par clé, gabarit et tonalité du profil | `tests/integration/engagement/test_engagement_notify.py` + `tests/unit/engagement/test_engagement_platform.py` |

## Non porté dans cette tranche

| Test TypeScript | Motif |
|---|---|
| `packages/services/src/notifications-generation-des-rappels.test.ts` | producteurs de rappels (job `notifications-reminders`), branchés au worker en SPEC-2207 : `sync_validation_quiz_reminders` reste à porter. |
| `packages/services/src/spec-720.test.ts`, `spec-723.test.ts` (parties notifications) | dépendent du moteur d'automatismes (passe suivante) et du consommateur `review/session-completed` côté worker ; le jalon est en revanche couvert par `test_engagement_milestone_wiring.py`. |
| `packages/notifications/src/email/render.ts` (instantané HTML) | l'instantané React Email n'est pas rejoué : les textes et les sujets le sont, la structure DOM diffère (consigné dans `parity.md`). |
