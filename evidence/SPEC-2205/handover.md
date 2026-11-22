# Reprise — SPEC-2205 (état au 2026-11-22, fin de la tranche « cas d'usage de job »)

> **Clôture faite le 2026-11-22** : campagne de parité finale (8 scénarios `engagement` rejoués à
> l'identique, 22 scénarios des cinq groupes sans divergence), e2e `@SPEC-2205` (2 tests, dont
> 1 `@visual`) et `node tools/sdd/validate.mjs SPEC-2205` (8 / 8 étapes) verts. L'état de référence
> est [`acceptance.md`](./acceptance.md) ; les sections ci-dessous décrivent la reprise avant la
> clôture.

Spécification **partielle** : le domaine pur, la couche notifications, le moteur d'automatismes, le
service de pause et les **quatre cas d'usage de job** sont portés, prouvés et committés.
**Les vingt-et-une opérations** `engagement` de l'inventaire sont servies par Python et basculées.
Il reste la clôture : parité finale, page de démonstration + e2e/visuel, `acceptance.md`,
`validate.mjs` et `complete.mjs`.

## Fait et vérifié

| Étape du plan P22 | État | Preuve |
|---|---|---|
| 1. Scope | fait | `evidence/SPEC-2205/scope.md` |
| 2. Domaine notifications | fait | `domain/{routing,quiet,templates}.py`, `tests/fixtures/engagement_domain.json` (oracle `tools/engagement/oracle.mjs`) |
| 3. Domaine automatismes | fait | `domain/automations/*.py` ; `tests/fixtures/engagement_automations.json` (oracle `tools/engagement/oracle-automations.mjs`) : **140 cas** |
| 4. Requêtes | fait | `infrastructure/queries.py` ; réglages, journal, pause, expiration, revue, pages du tick, agenda et envois écartés, rappels, exercice pratique |
| 5. Plateforme | fait | `infrastructure/{email,email_templates,push,unsubscribe,unsubscribe_page}.py`, `templates/email/*.j2` |
| 6. Cas d'usage notifications | fait | `application/*.py`, `public.py` |
| 7. Dettes `notify` | faites | `learning/application/{series,review}.py` |
| 8. Cas d'usage automatismes | fait | `application/automations.py`, `application/weekly_review.py`, définitions et pause |
| 9. Cas d'usage de job | **fait** | `application/digest.py` (`plan_daily_digests`, `send_daily_digest`), `application/reminders.py` (`sync_validation_quiz_reminders`), `application/practice_exercises.py` (`ensure_practice_exercise`) |
| 10. Handlers + bascule | fait (21 opérations) | `apps/api-py/src/learny_api/handlers/engagement.py`, `api/ownership.yaml` |
| 11. Tests | fait pour le périmètre basculé | unitaires : **33 cas** (`test_engagement_jobs_domain.py`) ; intégration : **12 cas** (`test_engagement_jobs.py`) ; suite d'intégration complète **465 verts** |
| 12. Parité | faite une première fois | `evidence/SPEC-2205/parity.md` : 8 scénarios, 0 divergence ; à rejouer à la clôture |
| 13. Preuves | `scope.md`, `parity.md`, `test-port-map.md`, ce fichier | `acceptance.md` reste à écrire à la clôture |

Suite Python : **3408 tests unitaires verts** (`3375` au départ) et **465 tests d'intégration verts**
(`453` au départ). `ruff check`, `ruff format --check`, `mypy`, `lint-imports` verts.
Commits de cette tranche : `c3fd4fad` (domaine, cas d'usage, requêtes, textes, surface publique),
`6dec8c50` (oracle `tsx`, fixture, 33 unitaires, 12 intégrations), `0f469c42` (aucun apprenant
éligible dans la fenêtre) et `66b82cf2` (preuves).

## Ce qui reste, dans l'ordre

1. **Parité finale** : rejouer les huit scénarios de `evidence/SPEC-2205/parity.md` sur le HEAD de
   clôture, consigner les sorties et l'absence de divergence. Les quatre cas d'usage de job n'ont pas
   d'entrée HTTP : les prouver par leurs tests (oracle + intégration), pas par la parité HTTP.
2. **Page de démonstration + e2e/visuel** : `apps/web/app/%5Fdev/sdd/spec-2205/page.tsx` (modèle
   `spec-2203.tsx`) et `apps/web/e2e/specs/p22/spec-2205.spec.ts` avec un test
   `@SPEC-2205 @visual`.
3. **Clôture** : `acceptance.md` (tous les CA ✅ avec preuve, dont **CA-1** : les cas d'usage des
   jobs du périmètre sont portés et testés), `node tools/sdd/validate.mjs SPEC-2205`, puis
   `complete.mjs --no-merge --no-push` (décision de l'agent principal).

## Points d'entrée exacts

| Besoin | Où |
|---|---|
| Produire une notification (autre contexte) | `learny.engagement.public.notify(...)` |
| Envoyer une livraison en attente / les livraisons échues | `learny.engagement.public.deliver_notification` / `deliver_due_deliveries` |
| Planifier les programmes du jour d'un tick | `learny.engagement.public.plan_daily_digests(deps, tick)` |
| Envoyer le programme du jour d'un apprenant | `learny.engagement.public.send_daily_digest(deps, user_id=…, at=…, time_zone=…)` |
| Générer les rappels de quiz de l'heure | `learny.engagement.public.sync_validation_quiz_reminders(deps)` |
| Planifier / annuler les rappels d'un créneau | `learny.engagement.public.schedule_validation_quiz_reminder` / `prune_validation_quiz_reminders` |
| Créer l'exercice pratique d'une notion (job `jeu-lacune`) | `learny.engagement.public.ensure_practice_exercise(deps, actor, notion_id)` |
| Lire / modifier les dix réglages | `learny.engagement.public.list_my_automations` / `update_my_automation_setting` |
| Lire le journal filtré et paginé | `learny.engagement.public.list_my_automation_actions` |
| Expirer les actions échues (tick horaire, à câbler en SPEC-2207) | `learny.engagement.public.expire_due_automation_actions(deps)` |
| Lire la revue hebdomadaire | `learny.engagement.public.get_weekly_review(deps, actor, action_id)` |
| Ajouter un gabarit e-mail | `shared/locale_fr/engagement_email.py` + `templates/email/<clé>.{html,txt}.j2` + `infrastructure/email_templates.py` |
| Ajouter une dépendance de canal à un bundle de test | `tests/factories/engagement_deps.py` (`email_config`, `email`, `push`, `service_tx`) |
| Rejouer les vecteurs des jobs | `corepack pnpm exec tsx tools/engagement/oracle-jobs.mjs`, puis `tests/unit/engagement/test_engagement_jobs_domain.py` |

## Anomalies

- **`queries.py` jamais exécuté avant la tranche notifications** : deux défauts latents corrigés
  (`AmbiguousParameter`, `NoSuchColumnError`) ; l'intégration exécute désormais chaque énoncé.
- **HTML des e-mails** : textes, sujets, tonalités, jetons de couleur et en-têtes identiques au
  TypeScript ; la structure DOM n'est pas celle de React Email. Aucun oracle ne compare ce HTML.
- **Tri français des notions à risque** : table de translittération au lieu de `Intl.Collator`
  (déterminisme, ADR-0047) ; l'ordre est prouvé par l'oracle.
- **Politique de langue** : textes du moteur dans `locale_fr/engagement_automations.py`, contenu de
  l'exercice pratique dans `locale_fr/engagement_exercises.py`, libellés des jobs dans
  `locale_fr/engagement.py` ; sources hors `locale_fr` ASCII (ADR-2011).
- **Balayages globaux** : `plan_daily_digests` et `sync_validation_quiz_reminders` lisent tous les
  apprenants, comme les jobs TypeScript ; leurs tests neutralisent les lignes des autres suites
  locales **dans la transaction annulée**, sans écriture hors transaction.
- **Placement de `ensurePracticeExercise`** : cas d'usage du contexte `engagement` (P22) alors que
  le cycle de vie de l'exercice reste dans `assessments` ; aucune duplication.
- **Décompte 28 vs 21** : l'inventaire contient 21 opérations `engagement` ; l'écart correspond aux
  sept cas d'usage appelés par les jobs (déjà documenté pour SPEC-2203).
- Aucun ADR nécessaire : ADR-2015, ADR-2011, ADR-2008/ADR-1001 et ADR-2010 couvrent les décisions.
