# ADR-2040 — Démarrage de production refusé par l'API et le worker Python quand l'environnement est incomplet

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-009, ADR-2037, ADR-2006, SPEC-709

## Contexte

ADR-2037 laisse un écart ouvert : l'API Python ne refuse pas encore un démarrage de production incomplet (SPEC-009 CA-2). Le TypeScript validait l'environnement dans packages/config/src/env.ts (PRODUCTION_REQUIRED_KEYS, checkEnvironment) et refusait les modes simulés en production. Côté Python, Settings porte des valeurs par défaut documentées pour DATABASE_URL, SUPABASE_URL et d'autres clés : un secret de production absent n'échoue qu'au premier usage, pas au démarrage. Coolify déploie api-py et worker-py avec docker/compose.coolify-py.yml, qui fournit un ensemble fixe de variables (les critiques en ${VAR:?}) ; Inngest est retiré (ADR-2006) et la plateforme ne fournit plus de clé IA (SPEC-709).

## Décision

Porter la règle de production dans learny.shared.config, restreinte aux variables que le compose Python fournit : APP_ENCRYPTION_KEY, API_PROXY_SECRET, DATABASE_URL, EMAIL_LINK_SECRET, NEXT_PUBLIC_APP_URL, RATE_LIMIT_IP_SECRET, RESEND_API_KEY, STRIPE_PRICE_ID, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT et VOYAGE_API_KEY (les noms NEXT_PUBLIC_SUPABASE_* du TypeScript deviennent les noms lus par Python). Sont exclues les clés Inngest et ANTHROPIC_API_KEY (sans objet), les clés web-only et les clés d'entité légale que le compose ne fournit pas — leur ${VAR:?} reste le garde de Compose. Refuser aussi LLM_MODE=mock, RATE_LIMIT_MODE=off, STRIPE_MODE=mock, EMAIL_MODE=memory, PUSH_MODE=mock, JOBS_MODE=inline et ENABLE_SDD_PAGES=true, et exiger HTTPS pour NEXT_PUBLIC_APP_URL et SUPABASE_URL (mêmes codes missing/forbidden/incompatible que checkEnvironment). Nouvelle exception ConfigurationError qui n'expose que les noms triés et des codes sûrs, jamais une valeur. load_settings() applique le garde au démarrage de la façade (create_app sans Settings injecté) et du worker (python -m learny_worker) ; un Settings explicite (tests, outillage) reste maître de sa configuration.

## Conséquences

Un démarrage de production incomplet échoue immédiatement en nommant les variables à corriger, sans révéler de secret. Le compose Python et le déploiement Coolify ne changent pas ; la pile e2e (APP_ENV=test) n'est pas affectée. Les variables SUPABASE_JWT_SECRET, SMTP_* et NEXT_PUBLIC_VAPID_PUBLIC_KEY restent exigées par les ${VAR:?} de Compose, sans doublon côté application. L'écart ouvert d'ADR-2037 est refermé et SPEC-009 est amendée.
