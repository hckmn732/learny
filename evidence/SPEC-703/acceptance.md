# SPEC-703 — Micro-séance — preuves d'acceptation

Horloge figée `2026-11-11T12:20:00Z` (ADR-0047), IA simulée `LLM_MODE=mock`, base locale partagée sous `flock`.

## Critères d'acceptation

- ✅ CA-1 — Sélecteur interactif : `SessionModeSwitch` (unitaire `[SPEC-703] SessionModeSwitch`) et e2e `micro-séance de démonstration @SPEC-703` : clic « Micro-séance · 5 min » → URL `?mode=micro`, `aria-pressed="true"`, note exacte d'EF-3, « Jeu 1 sur 2 », rail de 2 jeux, annonce `aria-live` « Micro-séance chargée ».
- ✅ CA-2 — Composition : `packages/services/src/review/micro-composition.test.ts` (D = 3 et 5 → 1 carte + 1 question ; D = 10 → 2 cartes + 1 question) et intégration `[SPEC-703] micro-séance` (D = 5 et D = 10, `estimatedMinutes` = D).
- ✅ CA-3 — Priorité lacune : intégration « la carte porte sur la notion en lacune, avant les notions simplement dues » (carte = notion avec `gap_nature = forgetting`, raison « Choisi pour votre oubli »).
- ✅ CA-4 — Clôture qualifiante + événement : intégration « les réponses utilisent micro_session, la clôture qualifie le jour et émet l'événement » (`daily_activity.qualifying = true`, source `micro_session`, `review/session-completed` avec `mode: 'micro'`, `reviewedCount: 5`). Extrait capturé :
  `{"name":"review/session-completed","data":{"userId":"…","formationId":"…","sessionId":"…","mode":"micro","forDate":"2026-11-11","reviewedCount":5}}`
- ✅ CA-5 — Journal FSRS : intégration, `select distinct review_logs.source` = `['micro_session']` après une réponse de micro-séance.
- ✅ CA-6 — Coexistence des modes : intégration « les deux sessions du jour coexistent et gardent leur état » (deux `sessionId`, item répondu conservé) et e2e `retour à la séance complète @SPEC-703` (jeu 1 « Fait » après aller-retour).
- ✅ CA-7 — Démonstration : e2e `micro-séance de démonstration @SPEC-703` : fin « 5 notions revues en 5 minutes », cartes 4 / 1 / « 13 j », « Retour à l'accueil ». Lien direct `?mode=micro` couvert par `lien direct ?mode=micro @SPEC-703`.
- ✅ CA-8 — Conformité visuelle micro : e2e `micro-séance conforme @SPEC-703 @visual` — `expectTokens` (micro pressé `#111113`/`#FFFFFF`, complet `#62626B`, pastilles, encadré sombre, rail, carte), structure et textes, comparaison `SCR-10-micro-desktop.png` à **11,14 %** de pixels différents (seuil 12 %, annotation `mockup-diff-ratio` dans `e2e.json`), lignes de base `micro-session.png` et `micro-session-fin.png`, aucune violation axe serious/critical (`expectNoAxeViolations`/`axeCheck`).

## Non-régression

- `@SPEC-701` : les 4 tests e2e du quiz global restent verts (baselines `global-quiz-recto.png` et `global-quiz-fin.png` mises à jour pour le sélecteur désormais interactif et `gq-mode-micro` activé).
- Unitaire : `[SPEC-701]` global-quiz et `[SPEC-703]` composition/notes ; intégration `[SPEC-701]` et `[SPEC-703]`.
- `[SPEC-406]`, `[SPEC-409]` : moteur et série inchangés, couverts par leurs suites existantes.

## Preuves techniques

- Événement `review/session-completed` ajouté au catalogue typé `packages/contracts/src/events.ts` et documenté dans `docs/architecture/overview.md` §5.
- `GAMES_ENABLED = false` et `MICRO_SESSION_COMPOSITION` dans `packages/config/src/product.ts`.
- Référence visuelle `design/references/SCR-10-micro-desktop.png` (+ mobile) et scénario SCR-10/micro ajoutés au manifeste SPEC-005.
- Vidéos Playwright : `micro-séance de démonstration` et `retour à la séance complète` (pièces jointes `e2e.json`).
