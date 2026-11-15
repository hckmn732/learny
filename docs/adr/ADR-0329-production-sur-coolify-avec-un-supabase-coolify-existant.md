# ADR-0329 — Production sur Coolify avec un Supabase Coolify existant

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-15
- **Liens** : SPEC-012, SPEC-013

## Contexte

Le porteur du projet met Learny en production sur son serveur Coolify, qui héberge déjà un Supabase (service Coolify en un clic) qu'il veut cibler directement. La pile auto-hébergée (SPEC-012, docker/compose.selfhost.yml) embarque son propre Supabase, et la production gérée de SPEC-013 vise Vercel, Supabase Cloud et Inngest Cloud. Coolify ne monte pas les fichiers du dépôt Git dans les conteneurs d'une application Compose.

## Décision

Une pile dédiée, docker/compose.coolify.yml, déploie web, worker, Inngest auto-hébergé, un job de migrations idempotent (docker/apply-migrations.sh) et un serveur interne des modèles d'e-mails Auth. Elle rejoint le réseau Docker externe de la ressource Supabase (SUPABASE_NETWORK) et vise ses conteneurs par leur nom Coolify <service>-<uuid> (SUPABASE_SERVICE_UUID), avec une connexion Postgres directe, sans Supavisor en mode transaction. Les fichiers versionnés nécessaires (migrations, modèles supabase/templates, sonde Inngest) sont copiés dans des images d'appoint (docker/coolify-support.Dockerfile, contexte en liste blanche). Supabase Auth lit les modèles via MAILER_TEMPLATES_* pour garder les liens token_hash vers /api/v1/auth/callback. Le Compose exige toutes les PRODUCTION_REQUIRED_KEYS et fixe APP_ENV=production.

## Conséquences

Ce déploiement ne remplace pas la production gérée de SPEC-013, qui reste la référence. Il ne passe pas par deploy.yml : aucune garde de CI ni de région, à la charge de l'opérateur. Le Supabase Coolify tourne en Postgres 15 alors que la référence est en Postgres 17 : une incompatibilité se corrige par une nouvelle migration. Un Supabase dédié est recommandé, car le déclencheur sur auth.users et la configuration Auth sont globaux. Guide : docs/operations/coolify.md.
