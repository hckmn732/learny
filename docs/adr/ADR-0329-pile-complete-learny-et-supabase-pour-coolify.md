# ADR-0329 — Pile complète Learny et Supabase pour Coolify

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-15
- **Liens** : SPEC-012, SPEC-013

## Contexte

Le porteur du projet met Learny en production sur son serveur Coolify et veut une seule ressource à déployer, avec tous les services sur le même réseau Docker. La pile auto-hébergée (SPEC-012, docker/compose.selfhost.yml) est complète mais monte des fichiers du dépôt, publie des ports et sépare deux réseaux ; Coolify ne monte pas les fichiers du dépôt Git dans les conteneurs d'une application Compose et route lui-même ses domaines. La production gérée de SPEC-013 vise Vercel, Supabase Cloud et Inngest Cloud.

## Décision

Une pile dédiée, docker/compose.coolify.yml, reprend l'architecture et les images épinglées de la pile auto-hébergée : Postgres, GoTrue, PostgREST, Storage (fichiers) et Kong pour Supabase, plus Inngest, worker, web, un job de migrations idempotent (docker/apply-migrations.sh) et un serveur interne des modèles d'e-mails Auth. Sans bind mount, la configuration versionnée (rôles Postgres, configuration Kong, migrations, supabase/templates, sonde Inngest) est copiée dans des images d'appoint (docker/coolify-support.Dockerfile, contexte en liste blanche). Aucun port n'est publié : Coolify route un domaine vers web (3000) et un vers kong (8000). Tous les services partagent le réseau de la ressource. GoTrue lit les modèles Learny via GOTRUE_MAILER_TEMPLATES_* pour garder les liens token_hash vers /api/v1/auth/callback. Le Compose exige toutes les PRODUCTION_REQUIRED_KEYS et fixe APP_ENV=production.

## Conséquences

Ce déploiement ne remplace pas la production gérée de SPEC-013, qui reste la référence, et ne passe pas par deploy.yml : aucune garde de CI ni de région, à la charge de l'opérateur. Un seul réseau remplace le réseau interne de la pile auto-hébergée : aucun port n'est publié, mais Postgres n'est plus isolé de l'accès Internet sortant. Les sauvegardes de Postgres et des volumes Storage et Inngest relèvent de l'opérateur. Guide : docs/operations/coolify.md.
