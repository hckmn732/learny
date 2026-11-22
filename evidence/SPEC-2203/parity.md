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

Rappel de couverture : l'outil ne génère que des lectures **sans paramètre de chemin**. Pour le
contexte `content`, les lectures enregistrables sont `GET /api/v1/resources/:rid/url`,
`GET /api/v1/course-citations/:cid/source`, `GET /api/v1/modules/:mid` et
`GET /api/v1/modules/:mid/course` — toutes portent un paramètre de chemin, donc **aucun scénario ne
sera généré**. Les opérations restantes sont des mutations (`POST`, `PATCH`, `PUT`, `DELETE`).

Conséquence : la preuve de parité de ce contexte repose sur les tests d'intégration serveur (RLS,
codes d'erreur, événements, idempotence) et sur l'e2e via la façade, exactement comme le plan P22 le
prévoit pour les routes à paramètre de chemin (« les mutations et routes à paramètre de chemin sont
prouvées par l'intégration »). La matrice `test-port-map.md` liste les cas portés.

## Parité des extracteurs

Les extracteurs Python et TypeScript sont comparés sur les fixtures committées, texte normalisé
(espaces) par page :

| Fixture | TypeScript | Python | Écart observé |
|---|---|---|---|
| `WEB_FIXTURE_HTML` (`content_web.json`) | Readability + linkedom | `readability-lxml` + `lxml` | titre identique après normalisation du tiret cadratin (`—` → `-` par la bibliothèque) ; texte principal, `siteName`, `language` et ancrages `marge-brute`/`resultat-net` identiques ; l'ancrage du `h1` (`compte-resultat`) est conservé par `readability-lxml` alors que Readability le retire — **superset d'ancrages**, aucun décalage d'offset ni de citation |
| PDF généré (`pdf.ts`) | PDF.js (`unpdf`) | `pypdf` | même nombre de pages, mêmes lignes et mêmes bornes `{page,charStart,charEnd}` ; `pypdf` peut joindre deux lignes par `\n` là où PDF.js met un espace, sans changer le découpage sur les fixtures (frontières de paragraphe identiques) |
| YouTube (`youtube.ts`) | `youtubei.js` | `youtube-transcript-api` | mêmes identifiants, segments, bornes temporelles et textes (fixture JSON identique) ; en direct, le titre et la durée ne sont pas fournis par `youtube-transcript-api` : le titre retombe sur « Vidéo YouTube <id> », comportement de repli déjà prévu par le TypeScript |
| Image (`image.ts`) | `light` + vision | `light` + vision | même lecture mockée, même `contentOrigin = model`, même ancrage `lecture-ia` |

Aucun écart ne change une frontière de passage ni une citation sur les fixtures : aucun ADR de
déviation n'est donc ouvert. Si une future fixture introduit un écart de ce type, il devra être
consigné dans un ADR de la plage 2xxx avant de modifier une assertion.

## Divergences connues

Aucune divergence mesurée à ce stade puisque la campagne n'a pas tourné. Trois écarts de conception
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
3. **Upload PDF Anthropic Files** : le port `UploadPdf` existe et l'extraction texte est complète ;
   le défaut renvoie `None` tant que la résolution BYOK n'est pas branchée (SPEC-2204). Le
   TypeScript ne téléverse de toute façon que pour un modèle Anthropic choisi par l'apprenant.

## Preuves d'intégration de la bascule

- `test_content_summary.py` : commit du texte avant l'appel au modèle, correction mockée, rejeu
  sans second appel ni second événement, brouillon différé quand le tuteur est indisponible,
  validation et `NOT_FOUND`.
- `test_content_ingestion.py` : cinq étages, passages localisés, `resource/ready` unique, rejeu
  silencieux, échec permanent `NOTE_EMPTY` avec `resource/failed`, panne d'embeddings transitoire
  laissant la ressource `processing` puis reprise, identifiant invalide refusé avant toute requête.
- `test_handlers.py` : 18 opérations `py` et 18 handlers, aucune route `ts` servie par Python.
