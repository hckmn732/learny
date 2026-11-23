# Preuve — runbooks de bascule, arrêt d'urgence, rollback et restauration (SPEC-2301, EF-3)

**Date** : 2026-11-23. **Environnement** : VM de développement (PostgreSQL local
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, worker Python local). Les étapes qui
exigent le staging sont marquées **bloqué externe** (ADR-2009) ; les autres ont été exécutées.

Le runbook est `docs/operations/python-cutover.md` (10 sections). Chaque commande est écrite pour
être exécutée telle quelle, avec les variables définies en § 0.

## Ce qui a été exécuté en local

### 1. Outil de bascule et remise des propriétés

```bash
node tools/deploy/cutover.mjs --context learning --stage reads --relay-only
node tools/deploy/cutover.mjs --context learning --stage writes --current '<sortie précédente>'
node tools/deploy/cutover.mjs --context learning --stage rollback --current '…'
node tools/deploy/cutover.mjs --all --stage rollback     # {"*":"ts"}
node tools/deploy/cutover.mjs --all --stage writes       # {}
```

Sorties réelles et refus : `evidence/SPEC-2301/cutover.md`. Codes de sortie vérifiés : `0` succès,
`2` refus, message et code d'erreur sur stderr, stdout vide en cas de refus.

### 2. Drain du worker (nouvelle commande `python -m learny_worker.drain`)

```bash
$ DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  uv run python -m learny_worker.drain --wait 5 --json
{"ok": true, "state": {"failed": 0, "orphaned": 0, "pending": 0, "running": 0, "undispatched": 0}}

$ … uv run python -m learny_worker.drain --wait 5
drain : running=0 pending=0 failed=0 undispatched=0 orphaned=0 -> ok
```

La commande lit l'outbox et les livraisons dans une transaction de service, sans horloge murale
(un nombre fixe de sondages, ADR-0047). `--require-empty` sort en `1` dès qu'une livraison court,
attend, échoue (24 h), reste non répartie, ou qu'un événement a été estampillé sans livraison
(`orphaned`) : c'est le critère d'arrêt écrit avant toute remise de propriété.

### 3. Vérifications de la façade et de la pile

Les commandes `curl` du runbook (§ 1, § 2, § 6, § 7) visent le staging ; leur équivalent local est
couvert par l'e2e `@SPEC-2301` (`/api/v1/billing/subscription` en Bearer, 200 et `x-served-by`).

### 4. Sauvegarde et restauration

Le runbook § 8 donne les deux chemins (`pg_dump`/`pg_restore` dans une base de travail, PITR
Supabase), les commandes de comparaison de comptes et d'empreintes (`md5(string_agg(...))`) et les
contrôles de fumée de l'API sur la copie restaurée. Ils exigent le client PostgreSQL et une
sauvegarde de staging : **non exécutés ici**, chronométrage sur staging **bloqué externe** (CA-3).
Aucune durée n'est inventée.

## Couverture du runbook par les tests locaux

| Section du runbook | Preuve locale |
|---|---|
| § 4 canary + promotion | `tools/deploy/cutover.test.ts` (12 cas), `test_cutover_contract.py` (8 cas) |
| § 5 drain | `test_worker_cutover_rollback.py` (4 cas) et la commande exécutée ci-dessus |
| § 6 rollback d'un contexte et total | mêmes cas Vitest/pytest : `--stage rollback`, `--all --stage rollback` |
| § 7 arrêt d'urgence | même surcharge `{"*":"ts"}` + § 5 (le worker s'arrête, la façade relaie) |
| § 8 restauration | commandes fournies, exécution et chronométrage **bloqués externe** |

## Limites connues et assumées

- Le plan P23 prévoit un canary `py@<pourcentage>` par seau d'utilisateurs ; la façade n'accepte que
  `ts` et `py`. Le runbook utilise donc le canary **par contexte** (lectures puis mutations), et
  l'outil refuse explicitement `py@N` plutôt que de laisser croire à une bascule.
- Les commandes `docker compose` du runbook supposent l'hôte du staging ; en local, les équivalents
  `uv run …` sont fournis.
