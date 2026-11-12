# SPEC-111 — critères d'acceptation

Tous les critères ont été vérifiés sur la base Supabase locale (migrations `0018_groups` et
`0019_groups_rules`), avec l'horloge figée au 2026-11-11T12:20:00Z, `LLM_MODE=mock` et
`DATABASE_URL` local. Le code `LRN-AB23` de la démonstration est factice et n'ouvre aucune
invitation réelle. Preuves : `checks.json`, `unit.json`, `integration.json`, `e2e.json`,
`e2e.xml`, `summary.md`, `sql-constraints.txt`, `sql-concurrency.txt`, `sql-projection.txt`,
`sql-rls.txt`, `screenshots/`, `attachments/` (axe), `video/` et `baselines.md`.

- ✅ CA-1 — La migration crée `groups`, `group_members`, leurs clés étrangères, les contraintes
  `unique(formation_id)`, `unique(invite_code)`, `max_members BETWEEN 2 AND 10`, la forme
  `LRN-[A-Z2-9]{4}` et le rôle `owner|member` ; une onzième adhésion concurrente est refusée.
  Preuves : `packages/db/src/schema/groups.test.ts` (`[SPEC-111] group schema` : énumérations,
  colonnes, unique, capacité, motif du code, alphabet `A-Z2-9`, génération injectable et source
  cryptographique) ; `packages/db/test/integration/groups.test.ts` tests « CA-1 — les tables,
  contraintes, déclencheurs, politiques, vue et fonctions existent », « CA-1, CL-4 — les
  contraintes refusent code invalide, capacité hors bornes, doublons et rôle incohérent » (SQLSTATE
  23505 sur `groups_formation_id_unique`/`groups_invite_code_unique`, 23514 sur
  `groups_invite_code_format_check`, `groups_max_members_check`, `group_member_role_mismatch`),
  « CA-1, CL-2 — un code déjà utilisé est retiré sans écraser l'autre groupe » (deux groupes,
  `LRN-AB23` conservé puis `LRN-CD45`), « CA-1 / CL-1 — la dixième place est unique sous
  concurrence, la onzième est refusée » (1 réussite, 1 `CONFLICT`, 10 membres actifs exactement),
  « CA-1 — un groupe sans appartenance propriétaire est refusé à la validation » (23514 différé) et
  « CA-1 — la génération ne dérive jamais d’un identifiant et reste unique en pratique » (200 codes
  distincts, motif strict) ; `sql-constraints.txt` (contraintes, index, déclencheurs et politiques
  réels) et `sql-concurrency.txt` (résultat de la course des deux transactions).
- ✅ CA-2 — La vue `group_member_progress` ne contient que `group_id`, `user_id`, `first_name`,
  `current_module_position`, `validated_modules` et `streak_days` ; elle ne retourne aucune note,
  lacune, apport, cours, discussion, adresse e-mail ni créneau d'un membre. Preuves :
  `packages/db/test/integration/groups.test.ts` test « CA-2, EF-4, ET-3 — la vue ne projette que
  six champs et jamais une donnée personnelle » (ordre exact des colonnes via
  `information_schema`, `select *` limité aux six noms, trois membres dont un en pause, valeurs de
  module/validés/série, lectures de `notion_states`, `resources` et `schedule_slots` de Bob vides
  pour Alice y compris par jointure sur le programme partagé) et test « CA-2 — les lectures
  propriétaire/membre sont bornées et le code inconnu est refusé » ; `sql-projection.txt`
  (colonnes réelles de la vue et résultat pour l'appelant) ; `unit.json` (constante
  `GROUP_MEMBER_PROGRESS_COLUMNS`).
- ✅ CA-3 — Le comptage des formations actives ne double pas le propriétaire membre de son propre
  groupe et respecte le statut personnel d'un membre (pause non comptée, propriétaire compté une
  fois). Preuves : `packages/db/test/integration/groups.test.ts` test « CA-3, CL-5, CL-6 — le
  comptage ne double pas le propriétaire et respecte le statut personnel » (propriétaire avec
  formation active + groupe = 1 ; membre propriétaire d'une formation et membre actif = 2 ; pause =
  1 ; formation en pause et formation archivée non comptées ; `42501` pour un autre identifiant) ;
  `sql-projection.txt` (compteur réel pour le propriétaire et le membre) et `unit.json` (contrat
  des six colonnes de la vue).
- ✅ CA-4 — La rotation invalide immédiatement l'ancien code ; la RLS interdit à un non-membre
  l'accès au groupe et aux données personnelles, et seul le propriétaire modifie code et membres.
  Preuves : `packages/db/test/integration/groups.test.ts` test « CA-4, CL-3, CL-4 — rotation,
  sortie copiée, retrait et RLS des non-membres » (ancien code `LRN-AB23` introuvable après
  rotation en `LRN-CD45`, adhésion refusée avec l'ancien code, nouvelle adhésion acceptée,
  propriétaire refusé à la sortie, copie absente ou étrangère refusée sans fermer l'appartenance,
  sortie réussie seulement après création de la copie, retrait par le propriétaire, non-membre
  voyant 0 groupe et 0 ligne de vue, insertion refusée avec SQLSTATE 42501, suppression de la
  formation emportant groupe et membres) ; `sql-rls.txt` (lectures réelles à deux JWT et refus
  d'écriture) et `sql-constraints.txt` (politiques `groups_*` et `group_members_*`).
- ✅ CA-5 — La page `/_dev/sdd/SPEC-111` affiche le code factice étiqueté, la jauge « 3 / 10
  membres », la progression limitée (prénom, module, modules validés, série) et le compteur de
  formations actives ; elle passe axe, produit une vidéo et les captures desktop/mobile.
  Preuves : `apps/web/e2e/specs/p1/spec-111.spec.ts` test « inspecte la progression de groupe
  @SPEC-111 » (quatre régions, code `LRN-AB23` et avertissement, jauge native `max=10`/`value=3`,
  trois lignes Alice/Bob/Carol, aucun e-mail, aucune note, aucune lacune, aucun apport,
  compteur « 1 formation active ») et test « groupe conforme @SPEC-111 @visual @mobile » (jetons,
  structure, région défilante à 390 px, axe, captures ≤ 1 %) ; lignes de base
  `apps/web/e2e/__screenshots__/p1/spec-111.spec.ts/spec-111-group-desktop-linux.png` et
  `…-mobile-linux.png` ; `e2e.json` (3 tests réussis), `attachments/*-axe.json` (aucune violation
  serious/critical), `screenshots/`, `video/` et `baselines.md` (ligne de base SPEC-101 régénérée
  pour les deux migrations ajoutées).
