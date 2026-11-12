# SPEC-411 — critères d'acceptation

Validation du 2026-11-12 sur la branche `spec/SPEC-411-services-de-persistance-du-moteur`.
Résultats réels : lint, typecheck, build, 6 tests unitaires `[SPEC-411]`, 7 tests d'intégration
`[SPEC-411]`, 3 tests e2e `@SPEC-411` (dont 2 `@visual`), 6 vidéos (`checks.json`, `e2e.json`).

- ✅ CA-1 — Une tentative corrigée de deux notions crée deux `review_logs`, met à jour les deux
  états et `daily_activity` en une transaction, et un second appel ne change aucun compte.
  Preuve : test unitaire « ne réapplique aucune paire réponse × notion déjà journalisée » et
  « fait évoluer la carte FSRS dans l'ordre des réponses » (`unit.json`) ; test d'intégration
  « applique deux notions une seule fois et ne change aucun compte au second appel (CA-1) » :
  `reviewCount = 2`, puis `already_applied`, comptes et révisions inchangés (`integration.json`).
- ✅ CA-2 — Une lacune détectée ou levée crée exactement un `gap_event` et un événement de domaine
  après commit. Preuve : test unitaire « détecte une lacune à la deuxième occurrence de la même
  erreur (CA-2) » et « lève une lacune après deux réussites espacées » (`unit.json`) ; tests
  d'intégration « crée exactement une lacune et un événement après commit (CA-2) » et « lève une
  lacune et émet un seul événement cleared (CA-2) » : 1 ligne `gap_events`, 1 ligne
  `event_outbox`, événements capturés après le commit (`integration.json`).
- ✅ CA-3 — Une erreur forcée au milieu de l'application laisse les tables identiques à l'état
  initial. Preuve : test d'intégration « annule toutes les écritures quand une erreur survient au
  milieu (CA-3) » : 0 `review_logs`, 0 `notion_states`, 0 `daily_activity`, 0 `gap_events`,
  0 outbox (`integration.json`).
- ✅ CA-4 — Deux utilisateurs d'une même formation partagée ne lisent ni n'écrivent les états et
  résultats de l'autre ; les créneaux manuels et terminés survivent à la replanification.
  Preuve : tests d'intégration « isole deux membres d'une même formation partagée (CA-4) » (refus
  `NOT_FOUND` sur la tentative d'autrui, aucun état visible pour le membre) et « conserve les
  créneaux terminés et manuels lors d'une replanification (CA-4) » (`integration.json`).
- ✅ CA-5 — La démonstration affiche le résumé transactionnel réel du mode test, avec vidéo, axe
  et `@visual`. Preuve : e2e « applique un résultat @SPEC-411 » (desktop) et « résultat du moteur,
  conformité visuelle @SPEC-411 @visual @mobile » (desktop + mobile), 0 violation axe
  serious/critical, captures `screenshots/` et comparaisons `visual/`, vidéos
  `video/04-applique-un-resultat-desktop.webm` et
  `video/16-resultat-du-moteur-conformite-visuelle-mobile.webm` (`e2e.json`, `e2e.xml`).
