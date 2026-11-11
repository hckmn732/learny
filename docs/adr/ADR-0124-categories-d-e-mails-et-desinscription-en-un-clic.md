# ADR-0124 — Catégories d'e-mails et désinscription en un clic

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-204, SPEC-209, SPEC-211

## Contexte

BR-NOT-08 exige un lien de gestion des préférences dans chaque e-mail ; ADR-0032 réserve `List-Unsubscribe` aux e-mails non transactionnels. Le traitement d'une désinscription et le statut de l'e-mail de bienvenue ne sont pas définis.

## Décision

- Deux catégories : `transactional` (export prêt, suppression programmée, suppression effectuée ; plus les e-mails d'authentification servis par Supabase) et `service` (bienvenue, programme du jour, rappels, bilan de la semaine, échec de tâche IA).
- Tous les e-mails contiennent le lien « Gérer mes notifications » vers `/parametres#notifications`.
- Les e-mails `service` portent `List-Unsubscribe` (URL HTTPS) et `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) et ne partent que si `notification_settings.channel_email = true`.
- Jeton de désinscription : `base64url(userId).base64url(HMAC-SHA256(EMAIL_LINK_SECRET, "unsubscribe:v1:" + userId))`, sans expiration ; la désinscription met `channel_email = false` ; seul un POST modifie l'état (le GET affiche une confirmation).
- L'e-mail de bienvenue est envoyé immédiatement après la première vérification, hors plafond quotidien et heures calmes, mais seulement si `channel_email = true`.
- Les e-mails transactionnels ignorent préférences, heures calmes et plafond, et ne comptent pas dans le plafond (ADR-0031).

## Conséquences

Nouvelle variable `EMAIL_LINK_SECRET` ; nouvelle route publique `POST|GET /api/v1/email/unsubscribe`.
