# SPEC-705 — critères d'acceptation

Preuves des exécutions du 2026-11-14 sur la pile Supabase locale (jeu SPEC-115, horloge figée au
2026-11-11T12:20:00Z, `LLM_MODE=mock`). Les rapports `unit.json`, `integration.json`, `e2e.json`,
`e2e.xml`, `checks.json` et les captures/vidéos sont copiés ici par
`node tools/sdd/validate.mjs SPEC-705`.

- ✅ **CA-1** — Pour une activité future du seed, l'API renvoie trois créneaux compatibles triés
  par date ; choisir le deuxième déplace une seule activité et met l'agenda à jour.
  Preuve : intégration `[SPEC-705] service et API › CA-1` vérifie les trois alternatives triées,
  le successeur `moved_from_id`, l'ancien créneau `moved`, l'événement `agenda/slot-moved` et
  l'agenda rechargé ; e2e `@SPEC-705 › parcours` clique « Déplacer », choisit le deuxième
  créneau, confirme, recharge la semaine et retrouve le créneau déplacé dans la semaine choisie ;
  unitaires `[SPEC-705] règles et calculs` couvrent les alternatives, la version et le déplacement.
  Preuve : `integration.json`, `e2e.json`, `video/`, `screenshots/`.
- ✅ **CA-2** — Une proposition de décalage, volume ou allègement n'altère aucune ligne avant le
  clic de confirmation ; le refus laisse le plan identique.
  Preuve : intégration `CA-2 › les trois options n'altèrent rien` compare la fin et le nombre de
  créneaux avant/après `replan-options` et après une version obsolète (409) ; e2e
  `@SPEC-705 › parcours` compare la base avant, pendant la confirmation et après « Annuler » et
  vérifie les trois cartes `replan-option-*` ; unitaires `[SPEC-705]` vérifient l'absence
  d'écriture de `getReplanOptions` et les trois aperçus. Preuve : `integration.json`, `e2e.json`,
  `unit.json`.
- ✅ **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes
  identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  Preuve : intégration `[SPEC-705] service et API › CA-3` appelle le service avec un étranger
  (404), rejoue le déplacement identique (même successeur, même nombre de lignes et d'événements)
  et refuse les UUID invalides (400 `VALIDATION_FAILED`) ; le rejeu de réajustement avec version
  obsolète renvoie 409 sans second événement. Preuve : `integration.json`.
- ✅ **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune
  violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est
  conservée.
  Preuve : e2e `@SPEC-705 @visual @mobile` vérifie les jetons du panneau de déplacement et du
  panneau de réajustement, `axeCheck` ne remonte aucune violation serious/critical, les lignes de
  base `spec-705-deplacer-{desktop,mobile}-linux.png` sont produites à 1440 × 900 et 390 × 844,
  et Playwright conserve la vidéo. Preuve : `e2e.json`, `video/`, `screenshots/`.
