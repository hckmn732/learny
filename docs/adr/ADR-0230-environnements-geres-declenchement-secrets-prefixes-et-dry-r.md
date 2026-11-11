# ADR-0230 — Environnements gérés : déclenchement, secrets préfixés et dry-run

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-013, BR-PLA-04, ADR-0006, ADR-0017, ADR-0052

## Contexte

SPEC-013 doit déclencher preview et production sans jamais croiser les données, et rester vérifiable sans identifiants externes. Le référentiel ne fournit aucun projet Vercel/Supabase/Inngest : les contrôles statiques doivent rester exécutables et aucune preuve de déploiement réel ne peut être inventée.

## Décision

Le workflow deploy.yml écoute workflow_run du workflow CI et ne démarre que sur conclusion success pour head_sha ; preview répond aux pull_request et production aux push de tag v* après vérification merge-base avec origin/main. Chaque environnement GitHub (preview, production) porte des secrets préfixés PREVIEW_* / PRODUCTION_* et aucun job ne peut référencer le préfixe de l'autre. Les scripts tools/deploy/*.mjs utilisent des codes de sortie distincts (0 succès, 2 configuration invalide, 3 service indisponible), n'appellent aucun fournisseur en --dry-run, masquent les destinations et n'écrivent jamais de secret. vercel.json ne fixe aucune CSP pour ne pas contredire la CSP à nonce de SPEC-805 ; les migrations distantes sont forward-only, listées avant application, protégées par un point de restauration en production et comparent les empreintes via un manifeste optionnel.

## Conséquences

Les tests locaux valident le YAML, les régions, les scripts et la page SDD sans réseau. La preview/production réelles restent bloquées tant que les identifiants ne sont pas fournis ; SPEC-808 décide de la mise en production après vérification réelle. Les secrets restent hors du dépôt et les sorties de workflow ne publient aucune valeur secrète.
