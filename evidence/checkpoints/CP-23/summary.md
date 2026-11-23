# Checkpoint CP-23 — Bascule et retrait du backend TypeScript

- Date : 2026-11-23T04:38:27.000Z
- Résultat : ⛔ non franchi
- Spécifications de la phase : SPEC-2301, SPEC-2302

`node tools/sdd/checkpoint.mjs CP-23` ne peut pas être lancé : il refuse tant que les
spécifications de la phase ne sont pas toutes `done`.

## Causes

1. **SPEC-2301 — `blocked` (dépendance externe)** : les quatre critères d'acceptation exigent un
   staging Coolify fourni par le porteur (sondes, canary et rollback chronométrés, budgets
   d'ADR-0041, restauration de sauvegarde). Le travail local est livré et vert : configuration
   Coolify versionnée (deux services, une image, sondes, job de migration singleton), outil de
   bascule par surcharge de propriété avec canary en lecture et refus de deux écrivains, runbooks
   de bascule, d'arrêt d'urgence, de rollback et de restauration, commande de drain du worker,
   client Bearer externe simulé, exercice de rollback local sans perte ni double mutation.
   Voir `evidence/SPEC-2301/` et `progress/blockers.md` (ADR-2009, CL-3).
2. **SPEC-2302 — `in_progress`** : le retrait du backend TypeScript suppose qu'aucune entrée de
   `api/ownership.yaml` ne reste à `ts`. Or **16 entrées sont encore relayées** : 15 routes de
   démonstration `dev.sdd.spec-*` et `home.get`. `apps/api` ne peut pas être supprimé tant qu'une
   seule subsiste. Voir `evidence/SPEC-2302/{scope.md,blockers.md}`.

## Conséquence

La piste `python-migration` s'arrête à **201 opérations sur 217**, **29 routes spéciales sur 32**,
**23 consommateurs sur 23** et **2 crons sur 2** servis par Python. Les 16 entrées restantes sont
relayées à Hono et **fonctionnelles**, mais empêchent la bascule complète.
