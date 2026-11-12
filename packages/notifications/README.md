# @learny/notifications

Service e-mail de Learny (SPEC-204, ADR-0054, ADR-0124) : huit gabarits React Email en français
(`emails/`, variantes « vous » / « tu »), trois transports (Resend en production, SMTP vers Mailpit en
local, mémoire en test), en-têtes `List-Unsubscribe` sur les e-mails `service`, désinscription en un
clic. Le routage in-app/push, les heures calmes et le plafond arrivent avec SPEC-205 et SPEC-209.

## API publique (`@learny/notifications/email`)

- `renderEmail(key, props, { tone, userId })` → `{ subject, html, text, headers, tags }`.
- `sendEmail(ctx, { userId, template, props, idempotencyKey, toOverride?, toneOverride? })` →
  `Result<{ messageId, category }>` ; lit `email` et `tutor_tone` du profil avec le rôle service ;
  ne contrôle **pas** `channel_email` (l'appelant le fait).
- `canSendServiceEmail(ctx, userId)` : `notification_settings.channel_email`.
- `getTransport()` : transport du processus selon `EMAIL_MODE` ; `setTransport()` en test.
- `EMAIL_TEMPLATES` : catégorie, schéma de props, sujet, composant de chaque gabarit.
- `createUnsubscribeToken` / `verifyUnsubscribeToken` : jeton HMAC sans expiration.
- `listOutbox()` / `clearOutbox()` : boîte d'envoi du transport mémoire.
- Erreurs : `EmailTransientError` (reprise) et `EmailRejectedError` (définitive).

## Aperçu

`pnpm email:dev` démarre le serveur d'aperçu React Email sur `packages/notifications/emails`
(port 3400). Les données d'exemple (`emails/fixtures.ts`) reprennent les maquettes (Alex Perrin,
mercredi 11 novembre 2026).
