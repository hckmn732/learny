# SPEC-706 — critères d'acceptation

Preuves des exécutions du 2026-11-14 sur la pile Supabase locale (`pnpm db:reset` puis jeu de
démonstration SPEC-115), horloge figée au `2026-11-11T12:20:00Z` (ADR-0047), IA simulée
(`LLM_MODE=mock`, ADR-0048), base partagée sérialisée par `flock /tmp/learny-sdd-db.lock`. Les
rapports `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, les vidéos et les
captures sont copiés ici par `node tools/sdd/validate.mjs SPEC-706`.

- ✅ **CA-1** — Les 13 types de BR-NOT-02 ont une fixture qui vérifie texte, cible et clé de
  déduplication ; deux événements identiques créent une seule notification.
  Preuve : unitaires `[SPEC-706] règles et calculs › CA-1 — les treize producteurs couvrent
  exactement BR-NOT-02`, `CA-1 — chaque fixture produit son type, sa cible et sa clé de
  déduplication` (13 fixtures, type, `href` interne, clé, texte `vous`/`tu` borné) et `CA-1 — deux
  événements identiques portent la même clé, donc une seule notification` ; intégration
  `[SPEC-706] service et API › CA-1 — les treize types sont écrits une seule fois, avec leurs
  livraisons` (13 lignes, 13 types distincts, rejeu complet → `created: false` partout, nombre de
  lignes et de livraisons inchangé) et `CA-1 — le texte suit le ton du profil (vous/tu)` ; e2e
  `@SPEC-706 › producteurs et rappels` (12 producteurs + le rappel = 13 types dans l'API et dans le
  panneau, 13 lignes `[data-notif]`, badge 13). Rapports `unit.json`, `integration.json`, `e2e.json`.

- ✅ **CA-2** — Un quiz à 15:00 génère un rappel éligible à 14:20 heure locale ; un déplacement
  supprime l'ancien rappel et programme le nouveau.
  Preuve : unitaires `[SPEC-706] règles et calculs › CA-2 — un quiz à 15:00 est rappelé à 14:20
  heure de Paris` (`startsAt 14:00Z` → `eligibleAt 13:20Z`, `localTime 15:00`, `staleAt` au début,
  libellé « aujourd’hui à 15:00 »), `CA-2 — un déplacement change la clé et invalide l’ancien
  rappel` (16:00 → éligible 15:20, clé différente) et `CA-2 — le fuseau du profil décide du libellé
  local` (Paris 15:00 / New York 09:00) ; intégration `[SPEC-706] service et API › CA-2 — un quiz à
  15:00 est rappelé à 14:20, un déplacement remplace l’ancien rappel` (deux livraisons `scheduled`
  à `13:20Z`, puis une seule ligne `validation_soon` avec la nouvelle clé `16:00`, `cancelled: 1`)
  et `ET-6 — le job horaire génère les rappels de l’heure, sans doublon` ; e2e `@SPEC-706 ›
  producteurs et rappels` (rappel `localTime 15:00`, `eligibleAt 2026-11-11T13:20:00.000Z`, puis
  déplacement à 16:00 → `eligibleAt 2026-11-11T14:20:00.000Z`, `cancelled: 1`, ancien identifiant
  absent). Rapports `unit.json`, `integration.json`, `e2e.json`, vidéo `video/`.

- ✅ **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes
  identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  Preuve : intégration `[SPEC-706] service et API › CA-3 — un autre utilisateur ne voit rien et une
  donnée invalide n’écrit rien` (formation d'autrui → `NOT_FOUND`/404 du catalogue, identifiant
  invalide → `VALIDATION_FAILED`/400, aucune ligne créée), `CA-3 — un utilisateur ne peut pas
  produire pour le compte d’un autre` (`NOT_FOUND`, propriétaire intact), `CA-1 — les treize types
  sont écrits une seule fois…` (rejeu identique : aucune nouvelle ligne ni livraison) et `CL-2 — un
  producteur périmé reçoit 409 et l’état actuel du créneau` (`CONFLICT`/409 avec `startsAt` courant,
  aucune écriture) ; `CL-5 — un rappel calculé dans le passé n’est pas envoyé tardivement` (aucune
  ligne) ; e2e `@SPEC-706 › producteurs et rappels` appelle la route réelle avec un corps invalide →
  400 `VALIDATION_FAILED` et total inchangé. Rapports `integration.json`, `e2e.json`.

- ✅ **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation
  serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.
  Preuve : e2e `@SPEC-706 @visual › conformité SCR-03` sur le jeu SPEC-115 (Alex, 8 notifications,
  3 non lues) : comparaison du panneau avec `design/references/SCR-03-notifications-desktop.png`
  → écart mesuré **7,86 %** (annotation `mockup-diff-ratio`, fichiers `visual/` côte à côte et diff),
  jetons `expectTokens` du panneau, du bouton cloche, de la pastille, des filtres et du lien
  « Gérer les notifications », groupes Aujourd’hui/Hier/Plus tôt et types « cours prêt » / « quiz à
  venir » visibles ; `toHaveScreenshot` desktop 1440×900 et mobile 390×844 ≤ 1 %
  (`apps/web/e2e/__screenshots__/p7/spec-706.spec.ts/`) ; `axeCheck` sans violation
  serious/critical ; e2e `@SPEC-706 › producteurs et rappels` conserve une vidéo (projection desktop
  et mobile). Rapports `e2e.json`, `e2e.xml`, dossiers `video/`, `screenshots/` et `visual/`.
