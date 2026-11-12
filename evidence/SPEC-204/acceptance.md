# SPEC-204 — critères d'acceptation

Validation du 2026-11-12 (horloge figée au 2026-11-11T12:20:00Z, `LLM_MODE=mock`,
`EMAIL_MODE=memory` pour les tests, SMTP réel vers Mailpit pour l'intégration CA-6).
Rapports : `checks.json`, `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `summary.md`.

- ✅ CA-1 — Les 8 gabarits × 2 tons se rendent en HTML et en texte et contiennent le lien « Gérer mes notifications » vers `/parametres#notifications`.
  Preuve : `packages/notifications/emails/templates.test.tsx` (`[SPEC-204] gabarits` : 16 combinaisons, sujets, `lang="fr"`, lien de préférences) ; instantanés texte dans `packages/notifications/emails/__snapshots__/templates.test.tsx.snap` ; e2e `aperçu et envoi des gabarits @SPEC-204` (parcours des 8 gabarits, sujet affiché) ; captures `screenshots/01-…-email-welcome.png` à `08-…-email-deletion-completed.png`.
- ✅ CA-2 — Les gabarits `service` portent `List-Unsubscribe` et `List-Unsubscribe-Post: List-Unsubscribe=One-Click` ; les trois gabarits transactionnels ne les portent pas.
  Preuve : `packages/notifications/emails/templates.test.tsx` (en-têtes par catégorie) et `packages/notifications/src/email/send.test.ts` (`[SPEC-204] envoi`, en-têtes et étiquettes) ; e2e `@SPEC-204` (en-têtes affichés dans `email-headers`, badge « Service »/« Transactionnel »).
- ✅ CA-3 — Aucune variante `tu` ne contient « vous », « votre » ou « vos » ; les sujets `vous`/`tu` correspondent à EF-2.
  Preuve : `templates.test.tsx` (contrôle lexical sur texte et sujet des 8 gabarits, sujets attendus) ; e2e `@SPEC-204` (aperçu `welcome` en `tu`, capture `screenshots/09-…-email-welcome-tu.png`).
- ✅ CA-4 — `POST /api/v1/email/unsubscribe` avec un jeton valide passe `channel_email` à `false` ; jeton altéré → 400 ; `GET` ne modifie rien.
  Preuve : `apps/web/test/integration/email-unsubscribe.test.ts` (6 tests : GET sans état, POST JSON et HTML, jeton altéré, page 400, `x-request-id`) ; `packages/notifications/src/email/unsubscribe-token.test.ts` (aller-retour, altération, forge, temps constant) ; e2e `@SPEC-204` (URL extraite des en-têtes, confirmation « C’est fait. »).
- ✅ CA-5 — `user/signed-up` envoie exactement un e-mail `welcome` (rejeu inclus) et aucun si `channel_email = false`.
  Preuve : `packages/jobs/test/integration/email-welcome.test.ts` (`[SPEC-204] fonction de bienvenue` : deux exécutions → un message, préférence coupée → zéro, refus définitif non réessayé) ; `packages/notifications/test/integration/email.test.ts` (lecture du profil et préférence).
- ✅ CA-6 — En `EMAIL_MODE=smtp`, un envoi depuis la page de démonstration apparaît dans Mailpit avec le sujet attendu ; en `memory`, dans la boîte d'envoi de la page.
  Preuve : `packages/notifications/test/integration/email.test.ts` (envoi réel SMTP vers Mailpit `127.0.0.1:1025`, sujet retrouvé par `GET /api/v1/messages`) ; e2e `@SPEC-204` (transport `memory`, `email-send-status` et liste `email-outbox` avec destinataire masqué).
- ✅ CA-7 — Une erreur 503 du transport Resend (simulée par MSW) est réessayée, une erreur 422 ne l'est pas.
  Preuve : `packages/notifications/src/email/transports/resend.test.ts` (`[SPEC-204] transport Resend` : 429/503 → `EmailTransientError`, 422 → `EmailRejectedError`, panne réseau transitoire, en-tête `Idempotency-Key` transmis).

## Conformité visuelle (mode demo)

- Ligne de base `apps/web/e2e/__screenshots__/p2/spec-204-email.spec.ts/spec-204-demo-desktop-linux.png` (`daily_digest`/`vous`).
- Aperçu `welcome`/`tu` : `spec-204-preview-tu-desktop-linux.png`.
- Jetons mesurés : page `#F4F4F1`, cartes blanches `#E7E6E1` rayon 24 px, segment actif `#111113` ; dans l'aperçu, bouton `rgb(17, 17, 19)` rayon 12 px, lien de pied `rgb(58, 58, 168)`, logo `rgb(198, 244, 50)`.
- Accessibilité : axe sans violation sérieuse ou critique sur la page (l'aperçu est un `iframe sandbox=""` statique, hors du document analysé).

## Non-régression

- Unitaires `[SPEC-204]` : 26 tests réussis ; intégration `[SPEC-204]` : 13 tests réussis ; e2e `@SPEC-204` : 2 tests réussis avec vidéos ; `@visual` : 1 test réussi.
- `lint`, `typecheck`, `build` et `openapi:check` réussis (voir `checks.json`).
