# ADR-0159 — Récupération réseau sécurisée (anti-SSRF)

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-505, SPEC-510, SPEC-512, SPEC-805

## Contexte

Le serveur contacte des adresses fournies par l'utilisateur (pages web, sous-titres YouTube, service compatible OpenAI) ou par un modèle (résultats de recherche). ADR-0057 fixe 15 s, 5 Mo et robots.txt, sans règle anti-SSRF détaillée.

## Décision

Module unique `packages/core/src/net/` : `assertPublicUrl(url, opts)` et `safeFetch(url, opts)`.
1. Schémas `https:` et `http:` seulement (pas de `file:`, `data:`, `ftp:`…), ports autorisés : 80 et 443 uniquement (tout port seulement avec `allowPrivate`, point 7) ; pas d'identifiants dans l'URL ; longueur ≤ 2048.
2. Résolution DNS (`dns.lookup` toutes adresses) avant connexion ; refus si une adresse est privée, de bouclage, lien-local, multicast, réservée, CGNAT, métadonnées (`169.254.169.254`, `fd00:ec2::254`), IPv4 mappée en IPv6 privée ; la connexion est épinglée sur l'adresse vérifiée (agent `undici` avec `connect.lookup` imposé) pour empêcher le DNS rebinding.
3. Redirections suivies manuellement, 5 au plus, chaque saut revérifié.
4. Délai total 15 s, taille maximale 5 Mo lue en flux (arrêt au dépassement), `User-Agent: LearnyBot/1.0 (+https://learny.app/bot)`, en-têtes `Accept` adaptés ; aucun cookie.
5. robots.txt : lu (même règles, 5 s, 512 Ko), mis en cache 24 h par hôte en mémoire du processus ; un `Disallow` applicable à `LearnyBot` ou `*` interdit la récupération (`WEB_ROBOTS_DISALLOWED`).
6. Erreurs typées : `URL_INVALID`, `URL_BLOCKED_HOST`, `FETCH_TIMEOUT`, `FETCH_TOO_LARGE`, `FETCH_HTTP_ERROR` (statut), `FETCH_TOO_MANY_REDIRECTS`, `WEB_ROBOTS_DISALLOWED`.
7. Exception unique : `allowPrivate: true` réservé aux modèles locaux quand `ALLOW_LOCAL_MODELS=true` (ADR-0154).

## Conséquences

Toute récupération serveur passe par `safeFetch` (règle ESLint interdisant `fetch` global dans `packages/ingestion` et `packages/llm/src/providers` hors client des SDK).
