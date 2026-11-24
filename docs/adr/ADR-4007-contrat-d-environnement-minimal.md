# ADR-4007 — Contrat d'environnement minimal

- **Statut** : Acceptée
- **Origine** : Validée (décision du porteur du projet, 2026-11-24)
- **Date** : 2026-11-24
- **Liens** : ADR-2042, ADR-4005, ADR-4006

## Contexte

ADR-2042 a réduit les variables lues par le backend Python, mais les piles déployées en déclaraient encore plus de soixante. Beaucoup étaient mortes depuis le retrait du backend TypeScript (Inngest, modes, rôle de l'API, proxy de confiance). D'autres étaient des secrets internes que l'exploitant devait générer et garder cohérents entre le web et l'API : secret du relais, secret des liens e-mail, paire VAPID, clé du limiteur. S'y ajoutaient des constantes déguisées en variables (identité légale, versions des documents, taille de pool, schémas PostgREST, limite de Storage) et un SMTP de Supabase Auth configuré à part de Resend.

Chaque variable de trop est un risque de déploiement : une valeur oubliée, une paire désynchronisée ou un secret recopié dans la mauvaise ressource Coolify.

## Décision

Le contrat déployé se réduit au strict nécessaire. Tout le reste est dérivé, constant ou supprimé.

### Obligatoires

| Variable | Rôle |
| --- | --- |
| `APP_ENV` | Littéral `production` dans `docker/compose.coolify.yml` |
| `LEARNY_PUBLIC_APP_URL` | URL publique du web |
| `LEARNY_PUBLIC_SUPABASE_URL` | URL publique de Supabase (Kong) |
| `POSTGRES_PASSWORD` | Mot de passe du rôle `postgres` |
| `SUPABASE_JWT_SECRET` | Signature des JWT Supabase |
| `APP_ENCRYPTION_KEY` | Clé maîtresse : chiffrement des clés IA et source des secrets dérivés |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anonyme (générée par `tools/docker/selfhost-secrets.mjs`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service (générée par `tools/docker/selfhost-secrets.mjs`) |

### Clés de fournisseurs

| Variable | Fournisseur |
| --- | --- |
| `EMAIL_FROM` | Adresse d'expédition ; une adresse nue reçoit le nom affiché `Learny` |
| `RESEND_API_KEY` | Resend (e-mails de l'application et SMTP de Supabase Auth) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe, clé publique servie par `config.public` |
| `VOYAGE_API_KEY` | Voyage (embeddings) |
| `SEARCH_API_KEY` | Recherche web de repli ; reste facultative au démarrage |

### Facultatives

| Variable | Rôle |
| --- | --- |
| `APP_ENCRYPTION_KEY_PREVIOUS` | Ancienne clé maîtresse pendant une rotation |
| `APP_VERSION`, `GIT_COMMIT` | Identité du build exposée par la sonde de santé |

### Dérivées d'`APP_ENCRYPTION_KEY`

Chaque secret est le HMAC-SHA256 de la clé maîtresse (espaces de bord retirés) sur un libellé, en hexadécimal. Le calcul est identique en Python (`learny.shared.config`) et en TypeScript (`@learny/config/derived-secrets`, côté serveur uniquement). Des vecteurs croisés le vérifient dans les deux suites.

| Ancienne variable | Libellé | Remarque |
| --- | --- | --- |
| `RATE_LIMIT_IP_SECRET` | `learny/rate-limit-ip/v1` | Déjà dérivée par ADR-2042 |
| `API_PROXY_SECRET` | `learny/api-proxy/v1` | `API_PROXY_SECRET_PREVIOUS` vient d'`APP_ENCRYPTION_KEY_PREVIOUS` |
| `EMAIL_LINK_SECRET` | `learny/email-link/v1` | Liens de désinscription |
| `VAPID_PRIVATE_KEY` | `learny/vapid/v1` | Scalaire `d mod (n − 1) + 1` sur P-256, en base64url de 32 octets |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | (clé publique de la précédente) | Calculée par le serveur du web et par l'API |
| `VAPID_SUBJECT` | (adresse d'`EMAIL_FROM`) | Déjà dérivée par ADR-2042 |

### Constantes du code ou littéraux des piles

| Ancienne variable | Valeur |
| --- | --- |
| `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOST_NAME` | `LEGAL_IDENTITY` de `packages/config/src/product.ts`, « [à compléter] » tant que le porteur ne l'a pas fournie |
| `LEGAL_CGU_VERSION`, `LEGAL_PRIVACY_VERSION` | `LEGAL_VERSIONS` de `product.ts` |
| `LOG_LEVEL` | `info` |
| `DATABASE_POOL_MAX`, `DB_LOG_QUERIES` | Constantes de l'API ; variables d'outillage du client de test seulement |
| `EMBEDDING_DIM` | Constante du code (1024) |
| `PGRST_DB_SCHEMAS` | `public,storage,graphql_public` |
| `STORAGE_FILE_SIZE_LIMIT` | `52428800` (BR-APP-02) |
| `GOTRUE_DISABLE_SIGNUP` | `false` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` | Production : `smtp.resend.com`, `465`, `resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `Learny`. QA et auto-hébergement : Mailpit en littéral |

### Supprimées

`INNGEST_*`, `LLM_MODE`, `STRIPE_MODE`, `EMAIL_MODE`, `RATE_LIMIT_MODE`, `PUSH_MODE`, `JOBS_MODE` (modes dérivés d'`APP_ENV`, ADR-2042), `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `LEARNY_API_ROLE`, `API_PORT`, `SUPABASE_JWKS_URL`, `TRUST_PROXY`, `ALLOWED_ORIGINS`, `SENTRY_DSN` et `NEXT_PUBLIC_SENTRY_DSN` (retirées des piles ; le web les lit encore si on les fournit), `SENTRY_AUTH_TOKEN`, `LLM_LIVE_TESTS`, `LEARNY_INNGEST_PORT`.

### Configuration publique des clients

L'opération `config.public` (`GET /api/v1/config/public`, sans authentification) renvoie `supabaseUrl`, `supabaseAnonKey`, `webUrl`, `vapidPublicKey` et `stripePublishableKey`, nuls quand ils ne sont pas configurés. L'application mobile n'a ainsi besoin que d'`EXPO_PUBLIC_API_URL` au build.

## Conséquences

- Une pile de production se configure avec 7 variables obligatoires, 8 clés de fournisseurs et 3 facultatives. `tools/deploy/coolify.test.ts` refuse toute réapparition d'une variable retirée.
- **Rotation** : changer `APP_ENCRYPTION_KEY` fait tourner tous les secrets dérivés.
  - Les liens e-mail déjà envoyés (désinscription) deviennent invalides.
  - La paire VAPID change, donc les abonnements push existants doivent être renouvelés par les navigateurs.
  - Le secret du relais reste accepté pendant la rotation grâce à `APP_ENCRYPTION_KEY_PREVIOUS`.
- Le web et l'API doivent recevoir la même `APP_ENCRYPTION_KEY`, sans quoi l'API refuse les en-têtes transmis par le relais.
- L'identité légale se renseigne dans le code (`TODO(owner)` dans `product.ts`) et `pnpm legal:check` la contrôle avant publication.
- En QA, l'expéditeur devient `Learny <qa@learny.test>` et tous les e-mails partent vers Mailpit.
