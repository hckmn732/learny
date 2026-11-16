# SPEC-719 — critères d'acceptation

Statut : validé le 2026-11-16. Preuves produites par les campagnes réelles de `tools/sdd/validate.mjs`
(unitaires, intégration Supabase locale, e2e Playwright avec vidéo, visuel) sous l'horloge figée
`2026-11-11T12:20:00Z` (ADR-0047) et `LLM_MODE=mock` (ADR-0048).

- ✅ **CA-1** — Avec K=3, une épreuve du 14 novembre produit des cibles J-3 et J-1 en jours locaux, 30 minutes chacune si créneaux compatibles.
  Preuve : `packages/services/src/spec-719.test.ts` (`sprintTargetDays('2026-11-14', 3)` →
  `2026-11-11` / `2026-11-13`, placement de deux créneaux de 30 min, stabilité autour du changement
  d'heure) ; `packages/services/test/integration/spec-719.test.ts` (deux lignes `sprint` de 30 min
  réellement écrites, sans chevauchement de l'épreuve) ; `e2e.json`/vidéo du test
  « parcours SPEC-719 @SPEC-719 » (`targets` = 11 et 13 novembre, `durationMin` = 30).
- ✅ **CA-2** — Déplacer l'épreuve replanifie uniquement les sprints futurs et ne modifie aucun sprint déjà fait.
  Preuve : l'intégration marque le sprint J-3 `done`, déplace l'épreuve au 19 novembre via
  l'événement `agenda/slot-moved` et vérifie `done` conservé, `2026-11-13` `cancelled`, nouvelles
  cibles `2026-11-16`/`2026-11-18` `planned` ; le parcours e2e rejoue le déplacement dans l'agenda
  et les captures `spec-719-sprint-j3` / `spec-719-sprint-deplace` montrent les créneaux avant/après.
- ✅ **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  Preuve : `packages/services/test/integration/spec-719.test.ts` (VALIDATION_FAILED sur UUID
  invalide, NOT_FOUND RLS pour un autre apprenant, CONFLICT sur une épreuve annulée, second appel
  `created = 0` avec un seul `automation_actions` et un seul événement `automation/action-applied`) ;
  e2e : second POST identique sans doublon puis POST invalide → 400 sans nouveau créneau.
- ✅ **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.
  Preuve : test « conformité SPEC-719 @SPEC-719 @visual » (jetons `#F0E9FE`/`#5B21B6` du créneau
  `sprint-slot`, structure agenda, axe sans violation serious/critical, captures
  `spec-719-sprint-desktop-linux.png` et `spec-719-sprint-mobile-desktop-linux.png` ≤ 1 %) ; la
  vidéo du parcours est collectée dans `evidence/SPEC-719/video/`.
