# ADR-0231 — Composants, versions et exposition réseau de la pile auto-hébergée

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-012, ADR-0053

## Contexte

SPEC-012 doit assembler un Compose auto-hébergé complet (web, worker, Supabase, Inngest) sans dépendre d'une infrastructure gérée et sans exposer inutilement des services. Le dépôt ne contient pas encore SPEC-009 (schéma complet des variables) ni SPEC-101 (client base). Les images Supabase auto-hébergées officielles et Inngest sont disponibles et doivent rester reproductibles.

## Décision

Le Compose épingle les images upstream exactes (Supabase postgres 17.11.0.006, gotrue v2.197.0, postgrest v16.5, storage-api v1.84.19, Kong 2.8.1, Inngest v1.52.0, Mailpit v1.33.1, base Node 24.22.3-alpine3.24). Kong en mode DB-less publie /auth/v1, /rest/v1 et /storage/v1 ; seuls web (8080), Kong (8000), Inngest (8288) et, avec le profil local, Mailpit sont publiés. Postgres, Auth, Storage, PostgREST, le worker et les migrations restent sur un réseau backend interne ; web et worker rejoignent un réseau egress séparé pour les appels sortants. L'init Supabase conserve l'utilisateur par défaut supabase_admin et un script d'initialisation attribue le mot de passe d'exécution aux rôles de connexion supabase_auth_admin, supabase_storage_admin et authenticator.

## Conséquences

Aucune version flottante ; toute mise à jour est coordonnée et documentée. Le trafic navigateur vers Supabase passe par Kong, pas par des ports internes. Un déploiement derrière TLS exige un reverse proxy devant web et Kong.
