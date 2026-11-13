# SPEC-615 — critères d'acceptation

Toutes les preuves ci-dessous proviennent de l'exécution réelle du 2026-11-13
(`node tools/sdd/validate.mjs SPEC-615`), horloge figée à 2026-11-11T12:20:00Z et `LLM_MODE=mock`.

- ✅ CA-1 — La lacune démo d'oubli apparaît dans le filtre Oubli, avec maîtrise et seuil exacts et prochaine révision locale.
  Preuve : `integration.json` — test « renvoie les statistiques, les compteurs et les cartes » (4 lacunes ouvertes, nature `forgetting`, maîtrise 60, seuil 80, `nextReviewAt` 2026-11-11T16:00:00.000Z, fuseau Europe/Paris) ; `e2e.json` — « filtre et entraîne une lacune @SPEC-615 » (stats « 4 notions », « 23 notions », « 17:00 », carte Oubli, maîtrise 35 %, seuil 80 %) ; visuel `visual/17-conformite-spec-615-desktop-spec-615-desktop-side-by-side.png`.

- ✅ CA-2 — Passer de Toutes à Confusion met à jour `?nature=confusion`, les cartes et les compteurs sans changer les données persistées.
  Preuve : `unit.json` — `[SPEC-615] filtres par nature` (URL `?nature=confusion`, `aria-pressed`, clavier) ; `integration.json` — test « filtre une nature sans changer les compteurs ni les données persistées » (compteurs identiques, `notion_states`/`gap_events` inchangés) ; `e2e.json` — « filtre et entraîne une lacune @SPEC-615 » (Oubli puis Confusion, URL et une seule carte, compteurs Toutes 4/Confusion 1, agrégat SQL inchangé) ; `screenshots/02-filtre-et-entraine-une-lacune-desktop-spec-615-lacunes-filtre.png`.

- ✅ CA-3 — Les deux actions d'une carte mènent respectivement à l'entraînement adapté et à l'ancre du cours.
  Preuve : `unit.json` — `[SPEC-615] liens des cartes de lacune` (oubli/confusion/incompréhension → quiz global ciblé, application → exercice, ancre de cours valide, section absente sans lien) ; `integration.json` — mêmes liens dans le DTO (premier `training.href`, `course.href` avec `#cle-de-comptabilisation`) ; `e2e.json` — « filtre et entraîne une lacune @SPEC-615 » (URL `/quiz-global?cible=…`) et « revoit la lacune dans le cours @SPEC-615 » (URL `/modules/…/cours?chapitre=…#variante-d-exercice`, retour au filtre conservé) ; `screenshots/08-revoit-la-lacune-dans-le-cours-desktop-spec-615-retour-cours.png`.

- ✅ CA-4 — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  Preuve : `integration.json` — test « refuse une nature inconnue et une formation étrangère » (`VALIDATION_FAILED`, `NOT_FOUND`, compteurs d'écritures identiques avant/après deux lectures et une requête invalide) ; `e2e.json` — « refuse les lacunes d'un autre apprenant @SPEC-615 » (réponse HTTP 404, `system-not-found`) ; repli contrôlé « Toutes » sur nature inconnue vérifié dans le test visuel ; `screenshots/13-refuse-les-lacunes-d-un-autre-apprenant-desktop-screenshot.png`.

- ✅ CA-5 — L'écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.
  Preuve : `e2e.json` — `conformité SPEC-615 @SPEC-615 @visual` et `conformité SPEC-615 mobile @SPEC-615 @visual @mobile` : écart maquette desktop 8,05 %, mobile 11,83 % (≤ 12 %), axe sans violation serious/critical (`attachments/19-conformite-spec-615-desktop-axe.json`, `attachments/29-conformite-spec-615-mobile-mobile-axe.json`), lignes de base `SCR-13-desktop.png`/`SCR-13-mobile.png` à ≤ 1 % ; comparaisons `visual/17-…-side-by-side.png`, `visual/18-…-diff.png`, `visual/27-…-side-by-side.png`, `visual/28-…-diff.png` ; vidéos `video/04-filtre-et-entraine-une-lacune-desktop.webm`, `video/10-revoit-la-lacune-dans-le-cours-desktop.webm`, `video/31-conformite-spec-615-mobile-mobile.webm`.
