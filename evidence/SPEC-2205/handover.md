# Reprise — SPEC-2205 (état au 2026-11-22)

Spécification **partielle** : le domaine pur est porté, prouvé et committé ; le reste est décrit
ci-dessous avec les points d'entrée exacts. Aucune entrée d'`api/ownership.yaml` n'a été basculée,
donc **aucun changement de comportement visible** et aucune dette d'oracle.

## Fait et vérifié

| Étape du plan P22 | État | Preuve |
|---|---|---|
| 1. Scope | fait | `evidence/SPEC-2205/scope.md` |
| 2. Domaine | fait | `learny/engagement/domain/{routing,quiet,templates}.py`, `tests/fixtures/engagement_domain.json` (oracle `tools/engagement/oracle.mjs`), `tests/unit/engagement/test_engagement_domain.py` — 1800 assertions vertes, égalité stricte avec le TS |
| 3. Requêtes | écrit, non encore appelé | `learny/engagement/infrastructure/queries.py` (SQL copié : `on conflict`, `for update`, verrou consultatif, `order by`) |
| 4. Cas d'usage | **à faire** | — |
| 5. Handlers | **à faire** | — |
| 6. Tests | domaine fait ; intégration à faire | — |
| 7. Parité | **à faire** | — |
| 8. Bascule | **non faite** (volontaire : pas de parité) | — |
| 9. Preuves | `scope.md`, ce fichier | `acceptance.md` à écrire à la fin |

Dépendances ajoutées à `packages-py/learny/pyproject.toml` et figées dans `uv.lock` :
`jinja2`, `aiosmtplib`, `pywebpush` (ADR-2015). Installées, non encore importées.

## Reste à faire, dans l'ordre

1. **Plateforme** — `learny/engagement/infrastructure/{email,push,unsubscribe_token}.py` :
   - e-mail : `EmailMode` `resend` (httpx) / `smtp` (aiosmtplib) / `memory` ; Jinja2 dans
     `learny/engagement/templates/email/` ; sujets et corps copiés de
     `packages/notifications/emails/*.tsx` ; en-têtes `List-Unsubscribe` +
     `List-Unsubscribe-Post` pour la catégorie `service` ;
   - jeton de désinscription : `base64url(userId) + "." + base64url(HMAC-SHA256(secret,
     "unsubscribe:v1:" + userId))`, comparaison à temps constant
     (`packages/notifications/src/email/unsubscribe-token.ts`, vecteurs à figer) ;
   - push : `build_push_payload`, `safe_notification_url`, `classify_push_status`,
     transport `mock` (`PUSH_MODE=mock`) et `live` (`pywebpush` + VAPID serveur).
2. **Cas d'usage** `learny/engagement/application/*.py`, signature `(deps, actor, ...)` :
   `notify` (verrou consultatif, `on conflict`, un seul effet par événement, envoi après commit),
   `deliver_notification`, `deliver_due_deliveries`, `plan_daily_digests`, `send_daily_digest`,
   `sync_validation_quiz_reminders`, `send_welcome_email`, plus l'inbox (`list`, `read`,
   `read_all`, `unread_count`), les réglages (`get`, `update` avec `expectedUpdatedAt` → 409),
   la désinscription par jeton et les abonnements push.
   `notify` est exposé par `public.py` puis **branché** dans `learny/learning` là où les dettes
   sont consignées (`learning.review.complete`, `learning.series.milestones`) : aucune
   duplication de logique.
3. **Handlers** `apps/api-py/src/learny_api/handlers/engagement.py` (un `@handler` par route).
4. **Bascule** des 10 opérations de notification (`notifications.*` 4,
   `me.notificationSettings.*` 2, `pushSubscriptions.*` 2, `email.unsubscribe*` 2) **dans le même
   commit** que les handlers : `tests/unit/test_handlers.py` impose `py_operations == HANDLERS`.
5. **Tests d'intégration** `tests/integration/engagement/test_engagement_*.py` : RLS, écritures,
   un seul effet par événement, erreurs attendues.
6. **Parité** `corepack pnpm parity:record --group engagement` puis `--check`, `parity.md`.
7. **E2E + visuel** : la page `/_dev/sdd/SPEC-2205` est déjà déclarée côté web
   (`apps/web/app/%5Fdev/sdd/spec-2205/page.tsx` absent : à créer sur le modèle de
   `spec-2203.tsx`) et `apps/web/e2e/specs/p22/spec-2205.spec.ts`.
8. **Clôture** : `acceptance.md` (tous les CA ✅), `node tools/sdd/validate.mjs SPEC-2205`, puis
   `complete.mjs --no-merge --no-push`.

## Opérations restantes hors notifications (5)

`me.automations.list`, `me.automations.update`, `me.automation-actions.{list,accept,decline,undo}`
(6 en réalité) et `me.pause.*` (4), `me.weekly-review.get` (1) dépendent du moteur d'automatismes
(`packages/automations/src/moteur-d-automatismes.ts`, 1015 lignes) et de ses dix définitions
(`definitions/*.ts`, environ 6 000 lignes) : `accept`/`undo` appellent `definition.apply` /
`definition.undo`, et `explain` produit le résumé d'une ligne. Les porter sans les définitions
changerait le comportement observable (aucun effet appliqué) : cette partie doit être traitée dans
une passe dédiée, avec ses propres fixtures d'oracle.

## Anomalies

- **Décompte 28 vs 21** : l'inventaire contient 21 opérations `engagement`, pas 28 ; l'écart
  correspond aux sept cas d'usage appelés par les jobs, nommés par le plan P22 (documenté dans
  `scope.md`, comme pour SPEC-2203).
- Aucun ADR n'a été nécessaire : toutes les décisions prises sont couvertes par ADR-2015 (dépendances)
  et ADR-2008/ADR-1001 (textes copiés au mot près).
