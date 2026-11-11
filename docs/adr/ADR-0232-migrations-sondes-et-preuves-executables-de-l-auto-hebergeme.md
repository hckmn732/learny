# ADR-0232 — Migrations, sondes et preuves exécutables de l'auto-hébergement

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-012, ADR-0053, ADR-0047

## Contexte

SPEC-012 exige des migrations non destructives au redémarrage, une santé qui ne présente jamais un web sain quand ses dépendances sont indisponibles, et des tests qui construisent réellement les images. Le client base de l'application (SPEC-101) n'existe pas encore : /api/v1/health renvoie donc database=not_configured.

## Décision

Un service migrate monte supabase/migrations en lecture seule et applique chaque fichier une fois dans une transaction, avec une empreinte SHA-256 dans public.selfhost_schema_migrations ; un fichier modifié après application arrête le runner. Le conteneur web exécute docker/healthcheck-web.mjs, qui vérifie l'API, un socket TCP vers Postgres, PostgREST, Auth, Storage et Inngest : si une dépendance tombe, web devient unhealthy même si l'endpoint local répond encore not_configured. Le test d'intégration construit réellement les deux images avec docker build, démarre un projet Compose isolé (learny-selfhost-it-<pid>), vérifie les utilisateurs non root, l'absence de fichier .env dans les images, les sondes, la persistance après restart et après down/up sans suppression de volumes, puis nettoie uniquement ses propres volumes.

## Conséquences

Aucune preuve de démarrage n'est simulée : sans Docker le test échoue avec un message explicite (CL-7). La santé applicative complète attendra SPEC-101, mais la sonde conteneur protège déjà la pile. Les preuves réelles (builds, config résolue expurgée, sondes, volumes) sont écrites dans evidence/SPEC-012.
