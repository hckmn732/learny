# ADR-4010 — Mutations anonymes des clients natifs sans Origin

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-25
- **Liens** : ADR-1005, ADR-3008, SPEC-3101, SPEC-2101

## Contexte

Le garde d'origine de l'API refusait toute mutation sans Origin ni Sec-Fetch-Site, sauf avec un jeton Bearer (ADR-1005 point 6). Une application native n'envoie ni Origin ni cookie, et n'a pas encore de jeton au moment de l'inscription (POST /auth/sign-up, ADR-3008 point 5) : l'inscription mobile recevait 403 ORIGIN_REJECTED sur la QA. L'écart était consigné dans evidence/SPEC-3101/acceptance.md et contourné par le test d'intégration qui posait l'origine du web.

## Décision

Le garde du pipeline (RequestOriginGuard) exempte, à côté de la mutation Bearer sans Origin, la mutation qui ne porte ni Origin, ni cookie, ni en-tête Authorization. Sans identifiant ambiant, une requête forgée n'a rien à détourner, et un navigateur envoie toujours Origin sur un POST cross-origin. Le garde interne (OriginGuard) et ses règles restent inchangés : une mutation avec cookie sans Origin, ou avec une origine étrangère, reste refusée.

## Conséquences

L'inscription et les autres mutations anonymes fonctionnent depuis l'application mobile. Aucun contrat, code d'erreur ni libellé ne change ; le limiteur de débit et la validation s'appliquent toujours. Test unitaire dans apps/api/tests/unit/test_guards_origin.py.
