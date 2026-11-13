# SPEC-613 — critères d'acceptation

Preuves produites par l'exécution réelle de `node tools/sdd/validate.mjs SPEC-613`, horloge figée
au 2026-11-11T12:20:00Z et `LLM_MODE=mock`. Les rapports `unit.json`, `integration.json`,
`e2e.json`, `e2e.xml`, `checks.json`, les vidéos et les captures sont dans `evidence/SPEC-613/`.

- ✅ CA-1 — Le tableau démo refuse un débit/crédit déséquilibré et accepte le tableau équilibré, avant tout appel IA.
  Preuve : `unit.json` — « refuse un débit et un crédit déséquilibrés avant tout appel au tuteur » et « accepte un tableau typé et équilibré » (`[SPEC-613] validation des productions`) ; `integration.json` — « refuse un tableau déséquilibré sans écriture ni événement (CA-1, CL-1, CL-4) » (422 `RESPONSE_INVALID`, `Écart : 20 €`, aucune tentative/réponse/événement) ; `e2e.json` — « résout un exercice structuré @SPEC-613 » (message « Écart : 20 € », aucune correction, puis « ✓ Pièce équilibrée »).

- ✅ CA-2 — Deux indices réduisent le score maximal de 10 à 8 ; un troisième est refusé ; la correction affiche un sous-score pour chaque critère.
  Preuve : `unit.json` — « retire un point de score maximal par indice utilisé » (maximum 10/9/8) et « applique un barème total de 10 et un sous-score par critère » ; `integration.json` — « révèle deux indices, refuse le troisième et plafonne le score à 8 (CA-2, CL-3) » (troisième requête 422, `hints_used = 2`) ; `e2e.json` — « résout un exercice structuré @SPEC-613 » (Indices 1 puis 2, bouton « Indices épuisés », barème 8 points, 5 critères, note « 8 / 10 »).

- ✅ CA-3 — Soumettre puis recharger retrouve la production et la correction, ainsi que la maîtrise avant/après.
  Preuve : `integration.json` — « soumet une fois, corrige par critère et met à jour la maîtrise (CA-2, CA-3, CA-4) » (production et correction relues, `masteryBefore = 55`, `masteryAfter` persistée) et « reprend le brouillon avant soumission (CA-3) » ; `e2e.json` — « résout un exercice structuré @SPEC-613 » (rechargement : note et cellule conservées) et « reprend une production @SPEC-613 » (cellules et explication restaurées avant soumission).

- ✅ CA-4 — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  Preuve : `integration.json` — « soumet une fois… » (second envoi : même tentative, une réponse, un `review_log`, un événement) ; « refuse un tableau déséquilibré sans écriture ni événement » (compteurs identiques) ; « renvoie 404 à un second utilisateur (CA-4) » (lecture, indice et soumission refusés en `NOT_FOUND`) ; `e2e.json` — « refuse l’exercice d’un autre apprenant @SPEC-613 » (HTTP 404, `system-not-found`).

- ✅ CA-5 — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.
  Preuve : `e2e.json` — « conformité SPEC-613 @SPEC-613 @visual » et « conformité SPEC-613 mobile @SPEC-613 @visual @mobile » : comparaison `SCR-08-base-desktop.png` et `SCR-08-base-mobile.png` (annotations `mockup-diff-ratio`, seuil 12 %), lignes de base `SCR-08-desktop.png` et `SCR-08-mobile.png` (≤ 1 %), axe sans violation serious/critical (`attachments/*-axe.json`) ; comparaisons `visual/*-side-by-side.png` et `visual/*-diff.png` ; vidéos `video/*.webm` dans `evidence/SPEC-613/`.
