# Reprise — SPEC-2205 (état au 2026-11-22)

Spécification **partielle** : le domaine pur **et** la couche notifications sont portés, prouvés et
committés. **Dix des vingt-et-une opérations** `engagement` sont servies par Python ; les onze
restantes dépendent du moteur d'automatismes et de la revue hebdomadaire.

## Fait et vérifié

| Étape du plan P22 | État | Preuve |
|---|---|---|
| 1. Scope | fait | `evidence/SPEC-2205/scope.md` |
| 2. Domaine | fait | `learny/engagement/domain/{routing,quiet,templates}.py`, `tests/fixtures/engagement_domain.json` (oracle `tools/engagement/oracle.mjs`), `tests/unit/engagement/test_engagement_domain.py` |
| 3. Requêtes | fait, et **exécuté** | `learny/engagement/infrastructure/queries.py` ; deux défauts latents corrigés (voir anomalies) |
| 4. Plateforme | fait | `infrastructure/{email,email_templates,push,unsubscribe,unsubscribe_page}.py`, `templates/email/*.j2`, `shared/locale_fr/engagement_email.py` |
| 5. Cas d'usage | fait pour les notifications | `learny/engagement/application/*.py`, `learny/engagement/public.py` |
| 6. Dettes `notify` | faites | `learny/learning/application/series.py` (`_notify_milestones`), `review.py` (réconciliation après la clôture) |
| 7. Handlers + bascule | fait (10 opérations) | `apps/api-py/src/learny_api/handlers/engagement.py`, `api/ownership.yaml` |
| 8. Tests | fait | `tests/unit/engagement/test_engagement_platform.py` et `tests/integration/engagement/test_engagement_{inbox,notify,settings,push_subscriptions,unsubscribe,milestone_wiring}.py` : **126 cas** ajoutés (les 1 800 assertions du domaine restent dans `test_engagement_domain.py`) |
| 9. Parité | fait | `evidence/SPEC-2205/parity.md` : 8 scénarios identiques, 0 divergence, oracle +265 lignes sans modification |
| 10. Preuves | `scope.md`, `parity.md`, `test-port-map.md`, ce fichier | `acceptance.md` reste à écrire à la clôture |

Suite Python : **3651 tests verts**, `ruff check`, `ruff format --check`, `mypy` et `lint-imports`
verts. Aucun test existant affaibli, aucun oracle existant modifié (l'oracle de parité ne reçoit que
le nouveau groupe `engagement`).

## Ce qui reste, dans l'ordre

1. **Moteur d'automatismes** (11 opérations `ts` restantes) : `me.automations.list|update`,
   `me.automation-actions.{list,accept,decline,undo}`, `me.pause.{get,start,end,diagnostic}`,
   `me.weekly-review.get`. Source : `packages/automations/src/moteur-d-automatismes.ts` (~1 000
   lignes) et ses dix définitions (`definitions/*.ts`, ~6 000 lignes) ;
   `accept`/`undo` appellent `definition.apply`/`definition.undo`. Porter sans les définitions
   changerait le comportement observable (aucun effet appliqué) : passe dédiée avec ses propres
   fixtures d'oracle. Inclut `expire_due_automation_actions` et `ensurePracticeExercise`
   (automatisation `jeu-lacune`).
2. **Cas d'usage des jobs restants** (SPEC-2207 câble les consommateurs, mais la logique appartient
   ici) : `plan_daily_digests` (+ `due_in_window`), `send_daily_digest`,
   `sync_validation_quiz_reminders`. Les briques existent déjà : `notify`, `send_email`, les cinq
   gabarits e-mail, les libellés `DIGEST_SLOT_LABELS` et `send_welcome_email`.
3. **Page de démonstration + e2e/visuel** : `apps/web/app/%5Fdev/sdd/spec-2205/page.tsx` (modèle
   `spec-2203.tsx`) et `apps/web/e2e/specs/p22/spec-2205.spec.ts` avec un test
   `@SPEC-2205 @visual`.
4. **Clôture** : `acceptance.md` (tous les CA ✅ avec preuve), `node tools/sdd/validate.mjs
   SPEC-2205`, puis `complete.mjs --no-merge --no-push`.

## Points d'entrée exacts

| Besoin | Où |
|---|---|
| Produire une notification (autre contexte) | `learny.engagement.public.notify(deps, user_id=…, notification_type=…, data=…, formation_id=…, dedupe_key=…, eligible_at=…, stale_at=…, external_channels=…)` |
| Envoyer une livraison en attente | `learny.engagement.public.deliver_notification(deps, delivery_id, stale_at=…, data=…)` |
| Rejouer les livraisons échues | `learny.engagement.public.deliver_due_deliveries(deps, limit=100)` |
| Envoyer un e-mail de gabarit | `learny.engagement.public.send_email(deps, user_id=…, template=…, props=…, idempotency_key=…)` |
| Ajouter une dépendance de canal à un bundle de test | imiter `tests/factories/engagement_deps.py` (`email_config`, `email`, `push`) : `Deps` les porte déjà en production (`shared/deps.py`, `build_deps`/`build_push`) |
| Ajouter un gabarit e-mail | textes dans `shared/locale_fr/engagement_email.py`, HTML et texte dans `templates/email/<clé>.html.j2` / `<clé>.txt.j2`, contexte dans `infrastructure/email_templates.py` |

## Anomalies

- **`queries.py` jamais exécuté avant cette tranche** : `SELECT_NOTIFICATION` échouait sur un NULL
  non typé (`AmbiguousParameter`) et `LOAD_DELIVERY` ne renvoyait pas `n.id` (`NoSuchColumnError`).
  Les deux sont corrigés ; les tests d'intégration exécutent désormais chaque énoncé du périmètre.
- **HTML des e-mails** : textes, sujets, tonalités, jetons de couleur et en-têtes sont identiques au
  TypeScript ; la structure DOM n'est pas celle de React Email (tables imbriquées). Aucun oracle ne
  compare ce HTML (consigné dans `parity.md`).
- **Décompte 28 vs 21** : l'inventaire contient 21 opérations `engagement` ; l'écart correspond aux
  sept cas d'usage appelés par les jobs (déjà documenté pour SPEC-2203).
- Aucun ADR nécessaire : ADR-2015 (dépendances), ADR-2011 (langue) et ADR-2008/ADR-1001 (textes)
  couvrent toutes les décisions.
