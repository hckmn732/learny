# SPEC-707 — Paramètres : onglets et Profil

Critères d'acceptation de `specs/p7-engagement/SPEC-707-parametres-onglets-et-profil.md` §11.
Preuves produites par `node tools/sdd/validate.mjs SPEC-707` (horloge figée 2026-11-11T12:20:00Z,
`LLM_MODE=mock`, seed SPEC-115). Rapports : `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`,
`checks.json`.

- ✅ CA-1 — Le hash `#notifications` sélectionne l'onglet correspondant, les flèches changent d'onglet et `#profil` est le défaut.
  Preuve : `unit.json` — `[SPEC-707] contrats des paramètres › CA-1` (`settingsTabFromHash('#notifications')`,
  `#modeles`, `#automatismes`, `#profil`, hash inconnu/absent → `profil`, `SETTINGS_DEFAULT_TAB`);
  `e2e.json` — `parcours SPEC-707 @SPEC-707` : `/parametres#notifications` ouvre l'onglet
  `settings-tab-notifications` (`aria-selected="true"`, titre « Notifications », URL `#notifications`),
  les flèches `ArrowRight`/`End`/`Home` déplacent l'onglet et le focus, `#inconnu` normalise vers
  `#profil` et affiche `profile-identity` ; `integration.json` — `[SPEC-707] service et API › CA-1`
  (état initial, rythme par défaut, export et suppression nuls).

- ✅ CA-2 — Avec 5 h/jour et 5 jours, le résumé indique 25 h/semaine ; 0 ou 7 h/jour et zéro jour sont refusés.
  Preuve : `unit.json` — `[SPEC-707] règles et calculs › CA-2` (`parseProfilePatch` accepte 5 h/jour et
  refuse 0, 7 et 2,5 h, un rythme sans jour ou sans moment) et `[SPEC-707] contrats des paramètres › CA-2`
  (`StudyRhythm` borne 1 à 6 h, au moins un jour et un moment) ; `integration.json` —
  `[SPEC-707] service et API › CA-2, ET-3` (écriture transactionnelle vérifiée dans
  `study_preferences` et `profiles`) ; `e2e.json` — résumé exact
  « 5 h par jour, 5 jours sur 7, plutôt matin et après-midi : 25 h par semaine. », PATCH 200 puis
  refus 400 de 7 h, 0 h et zéro jour avec `hours_per_day` resté à 5 en base.

- ✅ CA-3 — L'export et la suppression utilisent les statuts réels du service ; J+30 et l'annulation sont visibles sans supprimer immédiatement.
  Preuve : `e2e.json` — export réel `POST /api/v1/me/export` → 202, statut « Export prêt. » et lien
  `?download=1` répondant 302 ; dialogue de suppression daté du 11 décembre 2026, `POST
  /api/v1/me/deletion` → 200, `deletion_scheduled_for = 2026-12-11 12:20:00+00`, annulation qui remet
  la colonne à `null` ; `integration.json` — `[SPEC-707] service et API › CA-3, CL-5` (seconde demande
  idempotente, même échéance, état relu puis annulé) ; `unit.json` — `[SPEC-707] règles et calculs › CA-3`
  (`formatDeletionDeadline` à J+30 dans `Europe/Paris` et `America/Montreal`).

- ✅ CA-4 — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  Preuve : `integration.json` — `[SPEC-707] service et API › CA-4, CL-1` (corps `{}`, 7 h, fuseau
  invalide et e-mail refusés en `VALIDATION_FAILED`, état et version inchangés), `› CA-4, CL-2`
  (version obsolète → 409 `CONFLICT`, rejeu avec la version fraîche accepté) et `› CA-4 — RLS`
  (l'export et la suppression d'Alice restent invisibles à Bob, qui lit `null` : aucune donnée d'un
  autre utilisateur n'est rendue). Les routes `/me/profile` ne prennent aucun identifiant d'autrui,
  la séparation se fait donc par le client RLS du demandeur.

- ✅ CA-5 — L'écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.
  Preuve : `e2e.json` — `conformité SCR-15 @SPEC-707 @visual` (jetons de couleur, police Space Grotesk,
  textes, puis comparaison par région `settings-tabs`, `profile-identity`, `profile-rhythm`,
  `data-privacy`, `profile-save` avec `MOCKUP_MAX_DIFF_RATIO = 0.12` ; captures ≤ 1 % desktop et
  mobile) et `conformité SCR-15 mobile @SPEC-707 @visual @mobile` (aucun débordement horizontal,
  capture mobile). Comparaisons côte à côte et diffs : `visual/*-side-by-side.png` et `visual/*-diff.png`.
  Axe : `attachments/*-axe.json` sans violation serious/critical. Vidéos : `video/*.webm`
  (empreintes SHA-256 dans `summary.md`, ADR-0050).
