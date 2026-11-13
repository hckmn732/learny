# `@learny/tutor`

Actions du tuteur et garde-fous (SPEC-508, SPEC-512). Ce paquet ne contient aucune boucle ni
consigne : SPEC-508 ajoute la boucle agent et les prompts ; SPEC-512 y pose le registre d'actions
et l'outil `search_web`.

## API publique

```ts
import { searchWeb, searchWebTool, suggestResource, decideResourceSuggestion } from '@learny/tutor';

const result = await searchWeb(
  { task: 'programme', userId, db: userDb({ userId }), clock },
  { query: 'programme de révision en douze semaines', purpose: 'programme', limit: 5 },
);
```

- `searchWeb(ctx, { query, purpose, limit })` vérifie la tâche (`programme` uniquement) et l'usage
  (`programme` ou `resource_suggestion`) **avant** toute requête, puis interroge la recherche
  serveur Anthropic ou le repli Tavily (`SEARCH_API_KEY`). Le résultat est normalisé
  (`{title,url,snippet,publishedAt?,provider}`), dédupliqué par URL canonique et coupé au budget de
  la tâche programme.
- `searchWebTool` expose `{ name, description, inputSchema, outputSchema, guard, execute }` au
  registre de SPEC-508. `guard` renvoie `TOOL_NOT_ALLOWED` pour toute autre tâche.
- `suggestResource(ctx, { chapterId, title, url, reason })` enregistre une suggestion **en attente**
  (`resources.origin = tutor_suggestion`, `suggestion_status = pending`), idempotente par URL
  canonique et chapitre. `decideResourceSuggestion` applique l'import ou l'ignorance choisis par
  l'apprenant ; aucun contenu de cours n'est créé par ces opérations (BR-IA-12, BR-APP-05).

## Mode simulé

Les fournisseurs simulés et leurs fixtures vivent dans `@learny/llm` (`fixtures/search/`). Aucun
appel réseau n'a lieu en `LLM_MODE=mock` ; l'intégration utilise la vraie RLS et des comptes isolés.
