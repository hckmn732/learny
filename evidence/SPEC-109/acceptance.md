# SPEC-109 — critères d'acceptation

Tous les critères ont été vérifiés sur la base Supabase locale (migrations `0018_notifications` et
`0019_notification_rules`), avec l'horloge figée au 2026-11-11T12:20:00Z, `LLM_MODE=mock` et
`DATABASE_URL` local. Preuves : `checks.json`, `unit.json`, `integration.json`, `e2e.json`,
`e2e.xml`, `summary.md`, `sql-dedupe.txt`, `sql-rls.txt`, `screenshots/`, `attachments/` (axe),
`video/` et `baselines.md`.

- ✅ CA-1 — Les deux tables (`notifications`, `notification_deliveries`), leurs trois énumérations
  (`notification_type` à seize valeurs, `delivery_channel`, `delivery_status`), les contraintes et
  index correspondent à `data-model.md` §8 ; un `href` externe ou `javascript:` est refusé avant
  insertion, et une livraison incohérente (`sent` sans `sent_at`, `capped` avec `sent_at`,
  `scheduled` sans `scheduled_for`, erreur contenant une adresse) est rejetée. Preuves :
  `packages/db/src/schema/notifications.test.ts` (`[SPEC-109] notification schema` : énumérations,
  colonnes, unique `(user_id, dedupe_key)`, index `created_at DESC`, index partiel non lu, unique
  `(notification_id, channel)`, href interne, bornes titre 120 / texte 400 / clé 200, états et
  codes d'erreur) ; `packages/db/test/integration/notifications.test.ts` tests « CA-1 — les deux
  tables, trois énumérations, contraintes, index, déclencheur et politiques existent » (types
  `timestamptz`, RLS, politique `select` seule sur le journal) et « CA-1 / CL-4 / CL-5 — href
  dangereux, bornes et états de livraison incohérents refusés » (SQLSTATE 23514 sur
  `notifications_href_check`, `notifications_title_check`, `notification_deliveries_sent_at_check`,
  `notification_deliveries_scheduled_for_check`, `notification_deliveries_error_check` ; 23505 sur
  l'unicité par canal) ; `sql-dedupe.txt` (contraintes et déduplication réelles) et
  `sql-rls.txt` (politiques réelles).
- ✅ CA-2 — Deux insertions concurrentes avec la même clé créent une seule notification et au plus
  une livraison par canal, sans jamais réinitialiser `read_at` ; une clé nulle autorise plusieurs
  événements et la même clé reste indépendante d'un utilisateur à l'autre. Preuves :
  `packages/db/test/integration/notifications.test.ts` test « CA-2 / EF-2 / CL-1 / CL-2 / CL-3 —
  déduplication, lecture préservée et clés indépendantes par utilisateur » (deuxième appel
  `created: false`, même identifiant, `read_at` conservé, journal non dupliqué, clés nulles
  distinctes, clé identique pour Bob acceptée) et test « CA-2 / CL-1 — deux créations concurrentes
  avec la même clé ne produisent qu'une notification et une livraison par canal » (deux
  transactions réellement validées : une seule notification, une seule ligne `email`, instant de
  création du gagnant conservé) ; `sql-dedupe.txt` (`INSERT 0 0` au rejeu, 3 notifications, 2 non
  lues, `read_at` intact).
- ✅ CA-3 — Les défauts BR-NOT-04 de SPEC-102 restent disponibles (canaux, tous les types, digest
  08:00, heures calmes 21:00–08:00, week-end, plafond 5) ; ils ne sont pas réécrits par les
  notifications ni par une livraison écartée ; le compteur non lu et le filtre `all|unread`
  donnent les valeurs attendues. Preuves :
  `packages/db/test/integration/notifications.test.ts` test « CA-3 / EF-4 / BR-NOT-04 — défauts de
  SPEC-102 préservés, compteur, filtre non lu et marquage » (défauts exacts, livraison
  `skipped_pref` `no_subscription` sans `sent_at`, défauts inchangés après écriture, trois lignes
  triées de la plus récente à la plus ancienne, compteur 3 puis 2 puis 0, filtre et pagination,
  marquage d'une notification étrangère à 0 ligne) ; `sql-dedupe.txt` (compteur `3 | 2`, filtre
  `read_at is null`).
- ✅ CA-4 — Un second utilisateur ne lit ni ne modifie les notifications et livraisons d'autrui, et
  ne peut pas écrire dans le journal ; les écritures croisées sont refusées par la RLS
  (SQLSTATE 42501). Preuves : `packages/db/test/integration/notifications.test.ts` test
  « CA-4 / CL-7 — deux JWT ne lisent ni ne modifient les notifications et livraisons de l'autre »
  (une notification et une livraison visibles par Alice contre zéro pour Bob, mise à jour de la
  ligne de Bob à 0 ligne et `read_at` intact, insertion forgée et écriture du journal refusées en
  42501, journal de Bob toujours lisible par Bob) et test « ET-3 / ET-5 / EF-5 — journal par
  notification et canal, transitions monotones » (journal d'Alice vide pour Bob) ; `sql-rls.txt`
  (JWT d'Alice : 1 notification, 1 livraison, 0 ligne de Bob, `UPDATE 0`, refus RLS des deux
  insertions, notification de Bob toujours non lue).
- ✅ CA-5 — La page `/_dev/sdd/SPEC-109` affiche le compteur « 2 non lues », les trois
  notifications (bilan, lacune, programme du jour) et les quatre livraisons avec `sent`,
  `deferred_quiet` et `skipped_pref` traduits et iconographiés, sans adresse ni endpoint ; elle
  passe axe, produit une vidéo et les captures desktop/mobile. Preuves :
  `apps/web/e2e/specs/p1/spec-109.spec.ts` test « inspecte les notifications @SPEC-109 » (titre,
  deux régions, badge 2 non lues, ordre décroissant, dates à l'heure de Paris, états lus/non lus,
  quatre livraisons, `sent` le 11/11 08:00, `deferred_quiet` le 12/11 08:00, absence de `@` et de
  `https://` dans la page) et test « notifications conformes @SPEC-109 @visual @mobile » (jetons,
  structure, axe, région défilante à 390 px) ; lignes de base
  `apps/web/e2e/__screenshots__/p1/spec-109.spec.ts/spec-109-notifications-desktop-linux.png` et
  `…-mobile-linux.png` (nouvelles, ≤ 1 %) ; `e2e.json` (3 tests réussis, 6 vidéos),
  `attachments/*-axe.json` (aucune violation serious/critical), `screenshots/`, `video/` et
  `baselines.md`.
