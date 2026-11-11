# ADR-0140 — Paramètres et frontières du moteur d'apprentissage

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-401 à SPEC-411

## Contexte

ADR-0020 impose un moteur pur et sérialisable ; `docs/architecture/overview.md` §3 limite les imports de `learning-engine` à `core` et `ts-fsrs`, tandis que `docs/engineering/conventions.md` §2 exige que toute valeur métier vienne de `packages/config/src/product.ts`. Les deux règles sont incompatibles sans précision. Il faut aussi fixer la représentation du temps (la construction de `Date` est interdite hors de l'horloge).

## Décision

1. Les paramètres du moteur sont regroupés dans la constante `ENGINE` de `packages/config/src/product.ts`, exposée par l'export de sous-chemin pur `@learny/config/product` (aucune lecture d'environnement, aucun effet de bord). `@learny/learning-engine` peut importer **uniquement** ce sous-chemin de `@learny/config`, en plus de `@learny/core` et `ts-fsrs` ; la règle ESLint de frontières est mise à jour en conséquence.
2. Toute fonction publique du moteur prend ses entrées par un objet unique et un objet `params` optionnel (`Partial` des paramètres) fusionné avec `ENGINE` ; elle ne lit jamais l'horloge : l'instant courant est une entrée `now`.
3. Représentation : instants en chaîne ISO 8601 UTC (`InstantIso`, ex. `2026-11-11T12:20:00.000Z`), dates civiles `IsoDate` (`YYYY-MM-DD`), heures locales `LocalTime` (`HH:mm`), durées en millisecondes ou en minutes entières (noms suffixés `Ms`, `Minutes`). Les seules conversions vers ou depuis `Date` sont dans `packages/learning-engine/src/time.ts` (`Date.parse` et `new Date(ms)` sur une valeur explicite) ; si la règle ESLint interdit toute construction de `Date`, ce fichier porte une exception ciblée commentée renvoyant à cet ADR.
4. Les erreurs de contrat (entrée invalide) lèvent `EngineError` (`code` en `SCREAMING_SNAKE_CASE`) ; le moteur ne lève aucune autre exception. Les services les convertissent en `AppError`.
5. L'aléa est interdit sauf via `createSeededRandom(seed)` (FNV-1a 32 bits puis mulberry32) : même graine, même résultat.

## Conséquences

`docs/architecture/overview.md` §3 doit mentionner l'exception `@learny/config/product` (l'ADR prime). Les tests du moteur importent `ENGINE` pour leurs attentes.
