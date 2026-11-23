# Preuve — exercice de rollback local (SPEC-2301, CA-2 partie locale, CL-2)

**Date** : 2026-11-23. **Environnement** : PostgreSQL local
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), worker Python local (dépôt, pas
Docker), horloge figée 2026-11-11T12:20:00Z, consommateur réel `devtools.demo_job`. **Ce n'est pas
CA-2** : CA-2 exige un rollback chronométré sur le staging fourni par le porteur (ADR-2009).

## Commande et résultat

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  uv run pytest apps/worker-py/tests/integration/test_worker_cutover_rollback.py -q
# 4 passed in 2.68s
```

## Les quatre cas

1. **Le drain refuse une livraison en attente et accepte une file vide.** Un événement
   `sdd/demo-requested` est émis puis réparti : la livraison est `pending`, `--require-empty` refuse
   (le rollback attendrait), `running = 0` suffit sans l'option stricte. Après l'exécution, la file
   est vide et `--require-empty` accepte.
2. **Rollback après drain : aucun événement perdu, une seule exécution.** L'événement est réparti
   (livraison `pending`), la propriété du consommateur passe à `ts` (surcharge appliquée par
   `apply_overrides`), le répartiteur ne crée plus rien ; le lot en cours se termine (`done`,
   `attempts = 1`), la démonstration écrit ses trois étapes (`attempts = 1`, `finishedAt` non nul),
   l'outbox est vide. Le retour à `py` puis un nouveau dispatch et une nouvelle exécution ne créent
   **aucune** livraison et ne changent **ni** `attempts` **ni** le nombre d'étapes : la clé primaire
   `(event_id, consumer)` et la garde « run terminé » de `run_demo_pipeline` rendent le rejeu sans
   effet (clés d'idempotence).
3. **Basculer avant le drain perdrait un événement — et le drain le dit.** Consommateur déjà à
   `ts`, l'événement est estampillé sans livraison : `orphaned = 1`, `undispatched = 0`,
   `--require-empty` refuse. C'est exactement le piège du répartiteur (il estampille avant de faner).
4. **Reprise documentée.** L'événement est remis en file (`dispatched_at = null`), réparti et
   exécuté une seule fois : la file redevient vide. Le runbook § 5 décrit cette reprise avant toute
   remise de propriété.
5. **Un consommateur `ts` n'a aucune livraison Python** (quatrième test) : l'événement existe et
   reste estampillé, seul Inngest doit l'exécuter — la règle « un seul écrivain » côté jobs.

## Nettoyage

Les événements et les lignes `sdd_demo_runs` créés par les tests sont supprimés par la fixture
(`delete from public.event_outbox` en cascade sur `job_deliveries`, puis `sdd_demo_runs`). Aucune
ligne de base, aucun oracle, aucune donnée de démonstration n'est modifiée.

## Ce qui reste bloqué externe

Le rollback **sous charge** (k6) sur le staging, le chronométrage, l'absence de pic de 5xx et la
comparaison de compteurs de lignes : **CA-2 bloqué externe** (ADR-2009), consigné par `fail.mjs`.
