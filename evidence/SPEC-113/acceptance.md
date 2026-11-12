# SPEC-113 — critères d'acceptation

Mesures du 2026-11-11T12:20:00Z (horloge figée, ADR-0047) sur la base Supabase locale migrée par
`0026_rls_policies.sql` : **51 tables** dans le schéma `public`, **51 avec RLS activée et forcée**,
**69 politiques**. Les résultats détaillés table × rôle × opération sont dans
`evidence/SPEC-113/rls-results.json` et l'inventaire mesuré dans `rls-inventory.json`.

- ✅ **CA-1** — Toutes les tables applicatives `public` ont RLS activée et un scénario d'accès déclaré.
  Preuve : test unitaire `packages/db/src/rls/matrix.test.ts` (`[SPEC-113] RLS inventory`) qui confronte
  la matrice aux 51 `CREATE TABLE` des migrations et aux politiques encore déclarées ; test
  d'intégration `rls-matrix.test.ts` « pg_catalog contient exactement la matrice, avec RLS et FORCE
  RLS » ; `evidence/SPEC-113/rls-inventory.json` (`tableCount: 51`, `forcedCount: 51`).
- ✅ **CA-2** — A/B/C respectent le partage du programme, l'écriture propriétaire et la confidentialité
  de toutes les tables personnelles.
  Preuve : tests d'intégration « chaque table personnelle refuse lecture, insertion, modification et
  suppression étrangères » (42 tables personnelles × rôles A/B/C) et « le programme est lisible par les
  membres et modifiable par le propriétaire seulement » (A/B/C, liens personnels, sortie du groupe) ;
  `evidence/SPEC-113/rls-results.json`.
- ✅ **CA-3** — Les fonctions et la vue à droits élevés refusent un non-membre et ne retournent que les
  colonnes autorisées.
  Preuve : test d'intégration « la vue et les fonctions à droits élevés refusent un non-membre et
  projettent six colonnes » : `group_member_progress` expose exactement les six colonnes BR-GRP-03,
  C obtient 0 ligne, B ne lit ni e-mail, ni apport, ni lacune, ni message ; les helpers
  `is_formation_member`, `is_formation_owner`, `is_group_member`, `is_group_owner` et
  `count_active_formations` sont `security definer`, `search_path` fixé, non exécutables par `anon`.
- ✅ **CA-4** — Le harnais échoue si RLS est retirée d'une table ou qu'une politique permissive est
  introduite.
  Preuve : test d'intégration « retirer RLS, une politique ou introduire USING(true) fait échouer le
  harnais » (mutation annulée dans la transaction) ; test unitaire de rejet des `USING (true)` /
  `WITH CHECK (true)` sans justification `-- justification:` sur toutes les migrations.
- ✅ **CA-5** — La démonstration affiche les nombres mesurés, les catégories et la matrice, passe axe,
  vidéo et captures desktop/mobile.
  Preuve : `apps/web/e2e/specs/p1/spec-113.spec.ts` (`inspecte la matrice RLS @SPEC-113`, vidéo et
  capture `spec-113-rls-matrix`) et `matrice RLS conforme @SPEC-113 @visual @mobile` ; captures de
  non-régression `apps/web/e2e/__screenshots__/p1/spec-113.spec.ts/` ; rapport axe dans
  `evidence/SPEC-113/checks.json`, vidéos dans `evidence/SPEC-113/video/`, captures dans
  `evidence/SPEC-113/screenshots/` et `evidence/SPEC-113/visual/`.
