# ADR-0227 — Politique de validation de l'environnement et du fichier d'exemple

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-009

## Contexte

SPEC-009 fixe les exigences (EF-1 à EF-8, ET-1 à ET-5) mais laisse ouvertes plusieurs interprétations : quelles variables de .env.example relèvent du schéma d'exécution, comment lire la mention « Sentry si activé » (ET-3), quel niveau de normalisation appliquer aux valeurs, si les clés publiques font partie de l'objet serveur, si STRIPE_MODE=test est admis en production, et comment valider le fuseau horaire demandé par ET-2.

## Décision

Le schéma serveur couvre toutes les variables d'exécution documentées, y compris les six NEXT_PUBLIC_* (aucune n'est un secret), sous forme de listes explicites : SERVER_ENV_KEYS, PUBLIC_ENV_KEYS, TOOLING_ENV_KEYS (SDD_PUSH, E2E_SKIP_BUILD, PW_PERF, CHROME_PATH, hors schéma) et STANDARD_ENV_KEYS (TZ, CI, PORT, NEXT_RUNTIME). Le test de cohérence compare .env.example à SERVER_ENV_KEYS + PUBLIC_ENV_KEYS + TOOLING_ENV_KEYS. Sentry reste facultatif en production (SENTRY_DSN validé s'il est fourni) : la spécification ne définit aucun indicateur d'activation. Les erreurs sont converties en noms de variables et codes sûrs (missing, invalid, incompatible, forbidden), jamais en messages Zod qui pourraient citer une valeur. La normalisation se limite aux énumérations documentées (espaces ignorés) ; une chaîne secrète entourée d'espaces est refusée et jamais nettoyée. En production, les modes simulés mock et memory sont interdits ainsi que DB_LOG_QUERIES, JOBS_MODE=inline et INNGEST_DEV=1 ; STRIPE_MODE=test reste admis (recette de paiement) car ET-3 n'interdit que mock. TZ, quand il est fourni, doit être un fuseau IANA valide.

## Conséquences

L'égalité entre l'exemple et les schémas est vérifiable mécaniquement (CA-3). Une variable ajoutée au schéma sans .env.example (ou l'inverse) fait échouer le test d'intégration. Aucun message d'erreur ne peut divulguer un secret (CA-2).
