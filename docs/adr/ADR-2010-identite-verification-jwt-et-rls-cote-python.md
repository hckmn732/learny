# ADR-2010 — Identité, vérification JWT et RLS côté Python

- **Statut** : Acceptée
- **Origine** : Déduite (préparation de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-0022, ADR-1005, ADR-1009, SPEC-2101

## Contexte

L'API TypeScript vérifie localement les jetons Supabase (ADR-1009), accepte cookie relayé et Bearer (ADR-1005) et exécute les requêtes sous RLS avec les claims de l'utilisateur (ADR-0022).

## Décision

- Supabase Auth et Storage sont conservés derrière des ports.
- Vérification locale des JWT avec PyJWT : signature JWKS (cache dix minutes, rechargement sur `kid` inconnu) ou HS256 selon la configuration, émetteur, audience `authenticated`, expiration selon l'horloge injectable ; repli identique à ADR-1009.
- Chaque transaction utilisateur exécute `set local role authenticated` et `set_config('request.jwt.claims', …, true)` avant toute requête ; l'identité ne vient jamais du corps, de la requête ou d'un en-tête relayé non signé.
- Le rôle de service n'est utilisable que par une liste fermée de cas d'usage (`learny.shared.privileged`), chacun testé et journalisé.
- La matrice RLS existante est rejouée sous Python (anonyme, propriétaire, autre utilisateur, membre, rôle de service).

## Conséquences

Aucune politique RLS n'est modifiée par la migration.
