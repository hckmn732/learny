# Parité contractuelle — SPEC-2203

## État

**Non exécutée** dans cette tranche. Le groupe `content` de `parity:record|check` demande la pile
Hono (`:3112`) et la façade (`:3101`) démarrées avec `OWNERSHIP_OVERRIDES=content:py`, plus la base
Supabase locale : la campagne n'a pas été lancée, aucune valeur n'est donc présentée comme mesure.

## Procédure de reprise (à exécuter telle quelle)

```bash
cd /home/ubuntu/projects/learny-wt-SPEC-2203
export PATH="$HOME/.local/bin:$PATH"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
pkill -f "tsx.*src/server.ts" ; pkill -f "uvicorn learny_api" ; pkill -f "learny_worker"
# 1. enregistrer contre Hono (propriétaire ts d'origine)
corepack pnpm parity:record --group content --target http://127.0.0.1:3112
# 2. rejouer contre la façade Python
corepack pnpm parity:check --group content --target http://127.0.0.1:3101
```

## Couverture attendue

L'outil ne génère que des lectures sans paramètre de chemin. Pour le contexte `content`, les
scénarios enregistrables sont `GET /api/v1/resources/:rid/url`, `GET /api/v1/course-citations/:cid/source`,
`GET /api/v1/modules/:mid` et `GET /api/v1/modules/:mid/course` — tous portent un paramètre de
chemin, donc **aucun scénario ne sera généré**. Les opérations restantes sont des mutations
(`POST`, `PATCH`, `PUT`, `DELETE`).

Conséquence : la preuve de parité de ce contexte repose sur les tests d'intégration serveur (RLS,
codes d'erreur, événements, idempotence) et sur l'e2e via la façade, exactement comme le plan P22 le
prévoit pour les routes à paramètre de chemin (« les mutations et routes à paramètre de chemin sont
prouvées par l'intégration »). La matrice `test-port-map.md` liste les cas déjà portés.

## Divergences connues

Aucune divergence mesurée à ce stade puisque la campagne n'a pas tourné. Deux écarts de conception
sont documentés :

1. **Émission de `resource/uploaded` à la finalisation** : le TypeScript émet après le commit avec
   une réclamation sur la ligne (`metadata.upload.eventClaimedAt`, reprise après un minuteur) ; le
   port Python écrit l'événement dans la transaction qui finalise, avec l'identifiant stable
   `resource-uploaded:<rid>` et le marqueur `upload.eventEmittedAt`. Un rejeu n'émet pas de second
   événement (prouvé par `test_content_resources.py`), mais un crash entre `commit` et livraison ne
   laisse pas de réclamation à reprendre : le worker Python (SPEC-2207) relit l'outbox, ce qui rend
   la réclamation inutile.
2. **Offsets de caractères** : les emplacements de passage sont comptés en unités UTF-16 côté
   TypeScript et en points de code côté Python. L'écart n'apparaît que sur des caractères hors BMP
   (emoji) ; il décale les `charStart`/`charEnd` suivant un tel caractère. Les vecteurs d'oracle
   excluent ces entrées ; le constat est consigné pour un ADR de la plage 2xxx.
