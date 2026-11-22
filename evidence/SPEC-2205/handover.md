# Reprise — SPEC-2205 (état au 2026-11-22, fin de la tranche « moteur d'automatismes »)

Spécification **partielle** : le domaine pur, la couche notifications et le **noyau du moteur
d'automatismes** sont portés, prouvés et committés. **Quatorze des vingt-et-une opérations**
`engagement` sont servies par Python ; les sept restantes dépendent des **définitions** des dix
automatismes (3 opérations de décision) et du **service de pause** (4 opérations).

## Fait et vérifié

| Étape du plan P22 | État | Preuve |
|---|---|---|
| 1. Scope | fait | `evidence/SPEC-2205/scope.md` |
| 2. Domaine notifications | fait | `domain/{routing,quiet,templates}.py`, `tests/fixtures/engagement_domain.json` (oracle `tools/engagement/oracle.mjs`) |
| 3. Domaine automatismes | **fait** | `domain/automations/*.py` (vocabulaires, schémas des dix paramètres, résumés, ordre/curseur, expiration, semaines, libellés, pause, registre + `validate_draft`) ; `tests/fixtures/engagement_automations.json` (oracle `tools/engagement/oracle-automations.mjs`), `tests/unit/engagement/test_engagement_automations_domain.py` : **140 cas** |
| 4. Requêtes | fait | `infrastructure/queries.py` ; réglages, journal filtré, pause active, expiration, quatre mesures de la revue |
| 5. Plateforme | fait | `infrastructure/{email,email_templates,push,unsubscribe,unsubscribe_page}.py`, `templates/email/*.j2` |
| 6. Cas d'usage notifications | fait | `application/*.py`, `public.py` |
| 7. Dettes `notify` | faites | `learning/application/{series,review}.py` |
| 8. Cas d'usage automatismes | **fait** | `application/automations.py` (`list_my_automations`, `update_my_automation_setting`, `list_my_automation_actions`, `expire_due_automation_actions`), `application/weekly_review.py` (`collect_weekly_review_data`, `get_weekly_review`) |
| 9. Handlers + bascule | fait (14 opérations) | `apps/api-py/src/learny_api/handlers/engagement.py`, `api/ownership.yaml` |
| 10. Tests | fait pour le périmètre basculé | `tests/unit/engagement/test_engagement_{domain,platform,automations_domain}.py` et `tests/integration/engagement/test_engagement_*.py` : 18 cas d'intégration ajoutés cette tranche (`automations_settings` 7, `automations_journal` 6, `weekly_review` 5) |
| 11. Parité | fait | `evidence/SPEC-2205/parity.md` : 8 scénarios identiques, 3 entrées désormais servies par Python, 0 divergence, aucune ligne de référence modifiée |
| 12. Preuves | `scope.md`, `parity.md`, `test-port-map.md`, ce fichier | `acceptance.md` reste à écrire à la clôture |

Suite Python : **3820 tests verts** (`3651` au départ), `ruff check`, `ruff format --check`, `mypy`
et `lint-imports` verts. Commits de la tranche : `7b76dfc1` (noyau pur), `21ee1819` (réglages,
journal, expiration + bascule de 3 entrées), `34803cac` (revue hebdomadaire + bascule).

## Ce qui reste, dans l'ordre

1. **Définitions du moteur** (débloque `accept`, `decline`, `undo`) : `packages/automations/src/
   definitions/*.ts` (échauffement 904, jeu-lacune 761, micro-séance 602, questions-cartes 427,
   remédiation 880, reprise 1165, pause 124 lignes), `automatisme-7` (120), `automatisme-8` (857),
   `automatisme-9` (177) et `micro-seance/should-propose.ts` (101), plus les aides `reprise/*.ts`.
   Chaque définition doit fournir `explain` (texte d'une ligne, `locale_fr`), et un `apply`/`undo`
   qui **retourne une décision** (`AppliedEffect(changes=...)`) que `application/automations.py`
   écrit dans la transaction. Les effets réels s'appuient sur des services déjà portés côté
   `learny.learning` / `learny.assessments` (échauffement, micro-séance, jeu lacune, plafond quiz,
   cartes, remédiation) : les brancher plutôt que réimplémenter. Méthode de preuve : oracle `tsx`
   dédié (les définitions ne sont pas pures : prévoir un état d'entrée figé), fixture committée,
   pytest, puis bascule des 3 entrées **avec** leurs handlers et `test_handlers.py` vert.
2. **Service de pause** (débloque 4 entrées) : `packages/services/src/pause/index.ts` (949 lignes)
   — état (`none|active|ended`, `returnDue`), gel et reprise des formations, replanification,
   tirage du diagnostic (`buildDailySession` existe dans `learny/learning/domain/global_quiz.py`),
   activité quotidienne. `applyPauseAutomationInTx` et `pauseSummary` sont les points d'entrée de la
   définition `pause`. Attention : `replanFormationAfterResume` n'existe pas encore côté Python.
3. **Cas d'usage de job restants** : `ensurePracticeExercise` (définition `jeu_lacune`),
   `plan_daily_digests` (+ `due_in_window`), `send_daily_digest`,
   `sync_validation_quiz_reminders` — les briques (`notify`, `send_email`, les cinq gabarits,
   `DIGEST_SLOT_LABELS`, `send_welcome_email`) existent déjà. Câblage worker en SPEC-2207.
4. **Page de démonstration + e2e/visuel** : `apps/web/app/%5Fdev/sdd/spec-2205/page.tsx` (modèle
   `spec-2203.tsx`) et `apps/web/e2e/specs/p22/spec-2205.spec.ts` avec un test
   `@SPEC-2205 @visual`.
5. **Clôture** : `acceptance.md` (tous les CA ✅ avec preuve), `node tools/sdd/validate.mjs
   SPEC-2205`, puis `complete.mjs --no-merge --no-push`.

## Points d'entrée exacts

| Besoin | Où |
|---|---|
| Produire une notification (autre contexte) | `learny.engagement.public.notify(...)` |
| Envoyer une livraison en attente / les livraisons échues | `learny.engagement.public.deliver_notification` / `deliver_due_deliveries` |
| Lire / modifier les dix réglages | `learny.engagement.public.list_my_automations` / `update_my_automation_setting` |
| Lire le journal filtré et paginé | `learny.engagement.public.list_my_automation_actions` |
| Expirer les actions échues (tick horaire, à câbler en SPEC-2207) | `learny.engagement.public.expire_due_automation_actions(deps)` |
| Lire la revue hebdomadaire | `learny.engagement.public.get_weekly_review(deps, actor, action_id)` ; agrégats : `application.weekly_review.collect_weekly_review_data(tx, ...)` |
| Valider un brouillon d'action / enregistrer une définition | `domain.automations.validate_draft`, `domain.automations.AutomationRegistry` (prêts : `ActionDraft`, `ActionView`, `AppliedEffect`, `EffectContext`, `AutomationDefinition`) |
| Ajouter un gabarit e-mail | `shared/locale_fr/engagement_email.py` + `templates/email/<clé>.{html,txt}.j2` + `infrastructure/email_templates.py` |
| Ajouter une dépendance de canal à un bundle de test | `tests/factories/engagement_deps.py` (`email_config`, `email`, `push`, `service_tx`) |

## Anomalies

- **`queries.py` jamais exécuté avant la tranche notifications** : deux défauts latents corrigés
  (`AmbiguousParameter`, `NoSuchColumnError`) ; l'intégration exécute désormais chaque énoncé.
- **HTML des e-mails** : textes, sujets, tonalités, jetons de couleur et en-têtes identiques au
  TypeScript ; la structure DOM n'est pas celle de React Email. Aucun oracle ne compare ce HTML.
- **Tri français des notions à risque** : table de translittération au lieu de `Intl.Collator`
  (déterminisme, ADR-0047) ; l'ordre est prouvé par l'oracle.
- **Politique de langue** : les textes du moteur sont dans `locale_fr/engagement_automations.py` ;
  les sources hors `locale_fr` restent ASCII, échappements Unicode compris.
- **Décompte 28 vs 21** : l'inventaire contient 21 opérations `engagement` ; l'écart correspond aux
  sept cas d'usage appelés par les jobs (déjà documenté pour SPEC-2203).
- Aucun ADR nécessaire : ADR-2015, ADR-2011, ADR-2008/ADR-1001 et ADR-2010 couvrent les décisions.
