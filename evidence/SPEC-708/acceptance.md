# SPEC-708 — critères d'acceptation

Preuves produites par `node tools/sdd/validate.mjs SPEC-708` le 2026-11-14 (horloge figée
`2026-11-11T12:20:00Z`, base Supabase locale, `LLM_MODE=mock`). Rapports : `unit.json`,
`integration.json`, `e2e.json`, `e2e.xml`, `checks.json`.

- ✅ CA-1 — Par défaut les six types affichent « 6 sur 6 activés » ; en désactiver deux donne
  « 4 sur 6 activés » après rechargement.
  Preuves : unitaire `packages/services/src/spec-708.test.ts` (« six types par défaut, quatre après
  en avoir désactivé deux »), contrats `packages/contracts/src/parametres-notifications.test.ts`
  (« six types ordonnés comme la maquette »), intégration
  `packages/services/test/integration/spec-708.test.ts` (« six types et les défauts, puis quatre
  après rechargement » : compteur 6 → 4 et colonnes `type_validation`/`type_course` à `false`),
  route `apps/web/test/integration/spec-708-routes.test.ts` (GET/PATCH réels), e2e
  `apps/web/e2e/specs/p7/spec-708.spec.ts` (« parcours SPEC-708 » : « 6 sur 6 activés », deux
  interrupteurs coupés, « 4 sur 6 activés » après `reload`). Capture :
  `screenshots/01-parcours-spec-708-desktop-spec-708-parametres-notifications.png`.

- ✅ CA-2 — Une permission navigateur refusée n'enregistre aucun abonnement et n'éteint pas le
  canal application.
  Preuves : unitaire (`le canal application est toujours actif et non désactivable`, schéma
  `channels.app` limité à `true`), intégration (`un changement de canal ne touche ni l'application
  ni les abonnements push` : `push_subscriptions` reste à 1, `channels.app = true`), e2e
  (« parcours SPEC-708 » : `Notification.permission = 'denied'`, message « Notifications navigateur
  indisponibles », interrupteur navigateur à `false`, canal application à `true`, aucune ligne dans
  `push_subscriptions`). `Notification.requestPermission` n'est appelé qu'après le clic, via le
  helper de SPEC-205 (`apps/web/lib/push.ts`).

- ✅ CA-3 — Les réglages 08:00, 21:00–08:00 et week-end sont persistés et appliqués à une
  notification de test.
  Preuves : unitaire (`les heures calmes 21:00–08:00 reportent une notification de test à 08:00`,
  `le week-end ne laisse partir que les révisions dues, jusqu'au lundi 08:00`, `le programme du jour
  suit 08:00 dans le fuseau`), intégration (`08:00, 21:00–08:00 et week-end sont persistés et
  appliqués à un test` : 22:30 Paris → `deferred_quiet` à `2026-11-12T07:00:00.000Z`, samedi →
  lundi `2026-11-16T07:00:00.000Z`, `digest_time = 09:00:00`, `quiet_start = 22:00:00`,
  `weekend_quiet = true`), e2e (sélections 09:00 / 22:00 / 08:00, week-end coupé, valeurs relues
  après rechargement et vérifiées en base). La décision utilise le routeur pur de SPEC-209
  (`decideDelivery`) dans le fuseau IANA du profil.

- ✅ CA-4 — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques
  ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  Preuves : intégration service (`une requête invalide ne crée aucune écriture`, `une version
  obsolète renvoie 409`, `RLS : un second utilisateur garde ses propres réglages`, `un identifiant
  sans profil répond 404`), intégration routes (`corps invalide ou vide renvoie 400 sans écriture`,
  `version obsolète renvoie 409`, `deux requêtes identiques avec la même clé ne rejouent pas le
  service` : en-tête `idempotent-replayed: true`, `updated_at` inchangé, une seule ligne, `second
  utilisateur lit ses réglages et un profil inconnu répond 404`). Aucun événement n'est émis par
  cette capacité (`docs/architecture/api.md` : GET/PATCH `/me/notification-settings`).

- ✅ CA-5 — L'écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation
  serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.
  Preuves : `test('conformité SCR-15 notifications @SPEC-708 @visual')` compare
  `design/references/SCR-15-notifications-desktop.png` région par région — canaux **5,70 %**, types
  **4,54 %**, « Quand » **5,57 %** (≤ 12 %), avec comparaisons et diffs dans `visual/`
  (`…-notification-channels-side-by-side.png`, `…-notification-types-side-by-side.png`,
  `…-quiet-hours-side-by-side.png` et leurs `-diff.png`). Captures de référence
  `toHaveScreenshot` desktop et mobile (`__screenshots__/p7/spec-708.spec.ts/`) ; axe passe sans
  violation serious/critical sur le parcours et les deux tests visuels. Vidéos conservées dans
  `video/` (`04-…`, `15-…`, `19-…`, `23-…`), captures finales dans `screenshots/`.
