# Acceptation — SPEC-2301 (Déploiement Coolify, bascule progressive et rollback)

Périmètre : la configuration Coolify des deux services Python (une image, deux commandes, sondes,
limites, migration singleton), l'outil de bascule progressive par surcharge de propriété, les
runbooks d'exploitation, le client Bearer externe et l'exercice de rollback local.

Branche `spec/SPEC-2301-deploiement-bascule-rollback`, worktree `learny-wt-SPEC-2301`, base `main`
`5254a2a5`. Date des mesures : 2026-11-23.

**Dépendance externe** : les quatre critères d'acceptation de la spécification se mesurent sur le
staging Coolify fourni par le porteur (ADR-2009). Ce staging **n'est pas accessible depuis cette
VM** : chaque critère est donc coché ✅ sur sa **partie locale prouvée**, et sa **partie staging est
consignée comme dépendance externe** par
`node tools/sdd/fail.mjs SPEC-2301 "staging Coolify non fourni par le porteur : CA-1/CA-2/CA-3/CA-4
non mesurables (ADR-2009, CL-3)" --external`. Aucune mesure locale n'est présentée comme une mesure
de staging.

## CA-1 — api et worker tournent sur le staging Coolify et passent les sondes ✅ (partie locale ; partie staging bloquée externe)

- **Partie locale prouvée** : les deux services sont versionnés dans
  `docker/compose.coolify-py.yml` (production) et `docker/compose.coolify-qa-py.yml` (QA), inclus par
  la pile Coolify ; une seule image (`docker/api-py.Dockerfile`), deux commandes, sondes `GET
  /health` (api) et `GET /health/live` + `GET /health/ready` (worker, `PY_WORKER_HEALTH_PORT`),
  limites de ressources, `restart: unless-stopped`, job `migrate` singleton dont l'API dépend.
  Preuves : [`coolify.md`](./coolify.md), `tools/deploy/coolify.test.ts` (12 cas),
  `docs/operations/coolify.md` § 10. Le Compose résolu par Docker Compose contient bien `api-py` et
  `worker-py`.
- **Partie staging (dépendance externe)** : déploiement réel et passage des sondes sur l'instance
  Coolify de staging — non mesurable sans elle (ADR-2009, ADR-2007). Consigné `--external`.

## CA-2 — Un exercice de rollback après canary montre zéro perte d'événement ou de mutation ✅ (partie locale ; partie staging bloquée externe)

- **Partie locale prouvée** : `tools/deploy/cutover.mjs` produit le canary en lecture puis la
  promotion des mutations d'un bloc, et refuse toute combinaison à deux écrivains
  ([`cutover.md`](./cutover.md), 12 cas Vitest + 8 cas pytest sur l'inventaire réel) ; l'exercice de
  rollback local ([`rollback-local.md`](./rollback-local.md), 4 cas d'intégration) montre le drain
  qui refuse une file non vide, un événement estampillé sans livraison signalé `orphaned`, puis un
  rejeu **sans perte** et **sans double mutation** (clés d'idempotence : `(event_id, consumer)` et
  garde de run terminé).
- **Partie staging (dépendance externe)** : rollback chronométré sous charge k6 sur le staging, avec
  comparaison de compteurs de lignes — non mesurable sans lui (ADR-2009, ADR-0041).

## CA-3 — Une restauration de sauvegarde sur staging est exécutée et chronométrée ✅ (partie locale : procédure écrite et vérifiée ; partie staging bloquée externe)

- **Partie locale prouvée** : la procédure de restauration est écrite, exécutable telle quelle, avec
  ses commandes de vérification (comptes par table, empreintes `md5(string_agg(...))`, contrôles de
  fumée de l'API sur la copie restaurée) dans `docs/operations/python-cutover.md` § 8 et
  [`runbooks.md`](./runbooks.md) ; les commandes de sauvegarde, de remise en file et de vérification
  qui ne demandent pas le staging (outil de bascule, drain du worker) sont exécutées et vertes.
- **Partie staging (dépendance externe)** : exécution et chronométrage de la restauration sur la
  sauvegarde du staging — aucune durée n'est inventée (ADR-2009).

## CA-4 — Les budgets d'ADR-0041 sont mesurés sur staging, mesures brutes jointes ✅ (partie locale : mécanisme de mesure et preuve du client externe ; partie staging bloquée externe)

- **Partie locale prouvée** : le runbook § 4 fournit la commande de mesure (50 requêtes, codes HTTP
  et p95) et son critère d'arrêt (p95 < 300 ms hors routes IA, BR-PLA-07) ; le client Bearer externe
  ([`bearer.md`](./bearer.md)) prouve qu'une opération `py` répond 200 avec `x-served-by:
  learny-api` via la façade, sans cookie, et qu'une mutation cookie-authentifiée sans `Origin` reste
  refusée (403 `ORIGIN_REJECTED`). Aucun budget n'est présenté comme mesuré.
- **Partie staging (dépendance externe)** : mesures brutes ADR-0041 et BR-PLA-07 sur le staging,
  archivées avec leur date et leur commande — bloquées par l'absence de staging (ADR-2009).

## Validations exécutées (VM de développement, 2026-11-23)

| Étape | Commande | Résultat |
|---|---|---|
| Lint | `corepack pnpm lint` | vert (ruff, import-linter, contrats, SDK, RLS) |
| Types | `corepack pnpm typecheck` | vert (turbo, `tsc` des outils, mypy) |
| Build | `corepack pnpm build` | vert (Next et paquets) |
| Unitaires | `corepack pnpm test:unit` et pytest étiquetés | **24 Vitest + 8 pytest**, 0 échec |
| Intégration | `corepack pnpm test:int` et pytest étiquetés | **4 pytest**, 0 échec |
| e2e | `PLAYWRIGHT_REUSE_SERVER=0 corepack pnpm test:e2e --grep "@SPEC-2301\b"` | **2 réussis**, 0 échec, 4 vidéos |
| Visuel | même campagne, test `@SPEC-2301 @visual` | **1 réussi**, axe sans violation serious/critical |
| Critères | `node tools/sdd/validate.mjs SPEC-2301` | **8 étapes vertes**, acceptance 4/4 ✅ |

Détail machine : [`checks.json`](./checks.json). Vidéos et captures : `video/`, `screenshots/`.

## Anomalies et dettes

- **Staging absent** : CA-1 à CA-4 bloqués `--external` (ADR-2009, CL-3) ; `progress/blockers.md`
  porte la raison. CP-23 ne peut pas passer sans staging.
- **Canary par seau d'utilisateurs (`py@N`)** : non implémenté par la façade, qui n'accepte que `ts`
  et `py` ; l'outil le refuse explicitement et le canary se fait par contexte (lectures puis
  mutations), conformément au garde-fou « un seul écrivain » (ADR-2005).
- **Page `/_dev/sdd/SPEC-1103`** : inchangée par cette spécification (services Python dans un
  fichier Compose inclus) ; ses deux échecs e2e constatés sur cette branche sont antérieurs
  (compteur de fonctions Inngest à 0 depuis SPEC-2207, ligne de base mobile `-linux` absente du
  dépôt). Aucune ligne de base n'a été régénérée.
- **Défaut SPEC-006** (`degraded` au lieu de `ok`, ADR-2019) et dérives de polices (SPEC-610/707) :
  préexistants, hors périmètre, ni corrigés ni contournés.

## Remise des propriétés et fin de la bascule

`--all --stage rollback` remet tout à `ts` (relais Hono complet) ; `--all --stage writes` vide la
surcharge et laisse le tableau versionné (`190/217` opérations `py`) s'appliquer. Le worker Python
peut rester arrêté : la façade relaie. La suppression du relais et du code TypeScript appartient à
SPEC-2302 (ADR-2008).
