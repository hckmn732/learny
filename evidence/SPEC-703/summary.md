# SPEC-703 — Micro-séance — synthèse

- **Composition** : `composeMicroSession` (pure) sélectionne une carte de rappel (deux pour D = 10) sur la notion la plus urgente puis une question `choice_question` quand `GAMES_ENABLED = false`, sinon par ordre `cloze` > `matching` > `categorization` > `choice_question`, couvrant jusqu'à 4 notions prioritaires ; variantes déjà vues exclues, format manquant renvoyé à `requestRefill`.
- **Service** : `getOrCreateTodaySession` lit `durationMin` de `micro_seance` (3/5/10, défaut 5), fige `config.estimatedSec = D × 60`, la note EF-3 (adaptée CL-1/CL-2) et les puces EF-4 dans `activities.config`. `answerReviewItem` écrit `review_logs.source = 'micro_session'`. `completeReviewSession` ajoute `micro_session` aux sources de `daily_activity` et émet `review/session-completed` après commit (outbox SPEC-203).
- **Interface** : `SessionModeSwitch` est un groupe de boutons `aria-pressed` ; `router.replace` remplace l'URL (`?mode=micro`, sans entrée d'historique) ; annonce `aria-live` ; squelette pendant le chargement de l'autre mode ; clé TanStack `['global-quiz', fid, mode]`.
- **Compatibilité** : aucune dépendance à SPEC-702 (question à choix tant que `GAMES_ENABLED = false`) ni à SPEC-713 (accès manuel).
- **Visuel** : référence `SCR-10-micro-desktop.png` capturée depuis `QuizGlobal.dc.html` (scénario SCR-10/micro), écart mesuré **11,14 %** (seuil 12 %).

## Événement capturé (extrait integration)

```json
{
  "name": "review/session-completed",
  "data": {
    "userId": "…",
    "formationId": "…",
    "sessionId": "…",
    "mode": "micro",
    "forDate": "2026-11-11",
    "reviewedCount": 5
  }
}
```
