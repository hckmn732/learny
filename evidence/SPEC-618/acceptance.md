# SPEC-618 — critères d’acceptation

Preuves produites par `node tools/sdd/validate.mjs SPEC-618` le 2026-11-13 (horloge figée `2026-11-11T12:20:00Z`, `LLM_MODE=mock`).

- ✅ CA-1 — La formation choisie B reste la formation courante après reconnexion. Preuve : `unit.json`, `integration.json` (`CA-1 — la formation choisie reste courante après une reconnexion`), `e2e.json` (scénario `change et met en pause une formation @SPEC-618`, rechargement de `/accueil`).
- ✅ CA-2 — Une formation en pause n’a plus de créneau futur et la reprise en crée à partir du jour local sans modifier les tentatives passées. Preuve : `integration.json` (`CA-2 — la pause gèle les créneaux futurs et la reprise replanifie…`, tentative `graded` conservée), `e2e.json` (créneau futur `cancelled`, créneaux replanifiés après reprise).
- ✅ CA-3 — Deux demandes concurrentes ne portent jamais le nombre d’actives au-delà de trois. Preuve : `unit.json` (`[SPEC-618] limite des formations actives`), `integration.json` (`CA-3/CL-3 — deux reprises concurrentes…` : `applied` + `limit`, trois actives).
- ✅ CA-4 — Un second utilisateur reçoit 404 ; deux requêtes identiques ne dupliquent ni écriture ni événement ; une requête invalide ne crée rien. Preuve : `integration.json` (`CA-4 — un autre utilisateur reçoit 404…`, `CL-1/CL-2 — les statuts invalides…`), `checks.json`.
- ✅ CA-5 — La démonstration suit les jetons et la structure, axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée. Preuve : `e2e.json` (`conformité SPEC-618 @SPEC-618 @visual`, `conformité SPEC-618 mobile @SPEC-618 @visual @mobile`), captures `visual/`, vidéos `video/`, rapports axe joints.
