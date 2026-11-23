# Production sur Coolify — pile complète

Ce guide met Learny en production sur un serveur **Coolify** avec **une seule ressource** qui
contient tout : Supabase (Postgres, Auth, PostgREST, Storage, Kong), Inngest, le api, le web, les
migrations et les modèles d'e-mails. Tous les services partagent le réseau Docker que Coolify crée
pour la ressource : ils se joignent par leur nom de service (`db`, `auth`, `kong`…).

Fichiers de référence :

- `docker/compose.coolify.yml` — la pile déployée par Coolify ;
- `docker/coolify-support.Dockerfile` — images d'appoint qui embarquent la configuration
  versionnée (Coolify ne monte pas les fichiers du dépôt) ;
- `docker/web.Dockerfile`, `docker/api.Dockerfile` — les images applicatives.

L'architecture et les images épinglées sont celles de la pile auto-hébergée
(`docs/operations/self-hosting.md`, SPEC-012) ; les décisions propres à Coolify sont consignées
dans ADR-0329. La production gérée de référence de SPEC-013 (Vercel, Supabase Cloud, Inngest Cloud)
reste décrite dans `docs/operations/deployment.md`.

## 0. Services

| Service | Rôle | Domaine public |
|---|---|---|
| `web` | application Next.js | oui, port 3000 (URL de Learny) |
| `kong` | API publique de Supabase (Auth, PostgREST, Storage) | oui, port 8000 (URL de l'API) |
| `db` | Postgres Supabase 17 | non |
| `auth` | Supabase Auth (GoTrue) | non (via Kong) |
| `rest` | PostgREST | non (via Kong) |
| `storage` | Supabase Storage, fichiers sur volume | non (via Kong) |
| `api` | jobs Inngest : IA, e-mails, automatismes | non |
| `inngest` | Inngest auto-hébergé (SQLite) | non |
| `migrate` | job unique : applique `supabase/migrations`, puis s'arrête | non |
| `auth-templates` | sert les modèles d'e-mails lus par `auth` | non |

Volumes nommés : `db-data` (base), `storage-data` (fichiers déposés), `inngest-data` (historique
des jobs). Ils portent les données : ne les supprimez jamais sans sauvegarde vérifiée.

## 1. Prérequis

- Un serveur Coolify avec au moins 4 vCPU, 8 Go de RAM et 20 Go de disque libre (le build du web
  est la partie la plus gourmande).
- Deux noms de domaine qui pointent vers le serveur, par exemple `learny.exemple.fr` (web) et
  `api.learny.exemple.fr` (Supabase). Coolify leur fournit le HTTPS ; la production refuse une URL
  `http://`.
- Un SMTP pour les e-mails de Supabase Auth (inscription, lien de connexion). Avec Resend :
  `smtp.resend.com`, port `465` ou `587`, utilisateur `resend`, mot de passe = une clé Resend.
- Les comptes et clés exigés en production (`PRODUCTION_REQUIRED_KEYS`, `packages/config`) :
  Anthropic, Voyage (embeddings), Resend avec un domaine d'envoi vérifié, Stripe (mode `live`, ou
  `test` pour commencer), une paire de clés VAPID, et les mentions légales.

Cette pile a son propre Supabase. Un autre Supabase déjà présent sur le serveur n'est ni utilisé
ni modifié.

## 2. Générer les secrets

En local, depuis le dépôt :

```bash
node tools/docker/selfhost-secrets.mjs
```

Les neuf lignes sont toutes utilisées : `POSTGRES_PASSWORD`, `SUPABASE_JWT_SECRET`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (clés `anon` et `service_role`
signées avec ce secret JWT), `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `APP_ENCRYPTION_KEY`,
`RATE_LIMIT_IP_SECRET` et `EMAIL_LINK_SECRET`.

Conservez-les dans un coffre de secrets **avant** le premier déploiement, et ne les changez pas
ensuite sans procédure :

- `POSTGRES_PASSWORD` est inscrit dans les rôles Postgres au **premier** démarrage, sur un volume
  vide : le changer plus tard coupe Auth, Storage et PostgREST de la base.
- `SUPABASE_JWT_SECRET` signe les clés `anon`/`service_role` et les sessions : le changer impose de
  régénérer ces clés et déconnecte tout le monde.
- `APP_ENCRYPTION_KEY` chiffre les clés d'IA personnelles des utilisateurs : perdue ou changée, ces
  clés deviennent illisibles. Rotation : `docs/operations/key-rotation.md`.

## 3. Créer l'application dans Coolify

1. **+ New → Application**, source : le dépôt Git `hckmn732/learny`, branche `main`.
2. **Build Pack** : `Docker Compose`.
3. **Base Directory** : `/docker`. **Docker Compose Location** : `/compose.coolify.yml`.
   Les contextes de build (`context: ..`) visent alors la racine du dépôt.
4. **Domaines** (le suffixe indique à Coolify le port interne, il n'apparaît pas dans l'URL
   publique) :
   - service `web` : `https://learny.exemple.fr:3000` ;
   - service `kong` : `https://api.learny.exemple.fr:8000`.

   Aucun domaine pour les autres services, en particulier `inngest` (interface sans
   authentification) et `db`.
5. **Variables d'environnement** : section 4. Coolify bloque le déploiement tant qu'une variable
   obligatoire (`${VAR:?}` dans le Compose) est vide.
6. **Advanced** : désactivez *Inject Build Args to Dockerfile*. Par défaut, Coolify ajoute toutes
   les variables, secrets compris, comme arguments de build des Dockerfiles, où elles peuvent
   rester dans l'historique des images ; les Dockerfiles de Learny déclarent déjà les seuls
   arguments publics dont ils ont besoin.
7. **Deploy**.

Conseil : désactivez le déploiement automatique à chaque push et déployez à la main (ou depuis un
tag) une fois la CI verte. Coolify déploie ce qui se trouve sur la branche, sans attendre la CI.

## 4. Variables d'environnement

Les variables se saisissent dans l'onglet *Environment Variables* de l'application ; la vue
développeur de Coolify permet de coller un bloc au format `.env`.

### Secrets (section 2)

`POSTGRES_PASSWORD`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `APP_ENCRYPTION_KEY`,
`RATE_LIMIT_IP_SECRET`, `EMAIL_LINK_SECRET`.

### URLs publiques

| Variable | Valeur |
|---|---|
| `LEARNY_PUBLIC_APP_URL` | `https://learny.exemple.fr` (domaine du service `web`, sans barre finale) |
| `LEARNY_PUBLIC_SUPABASE_URL` | `https://api.learny.exemple.fr` (domaine du service `kong`) |

`LEARNY_PUBLIC_APP_URL`, `LEARNY_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont
**intégrées au build** du web. Après une modification, relancez un déploiement complet, pas un
simple redémarrage. Si votre version de Coolify propose l'option *Build Variable*, cochez-la pour
ces trois-là.

### E-mails de Supabase Auth

| Variable | Valeur |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` | serveur SMTP (Resend : `smtp.resend.com`, `465` ou `587`) |
| `SMTP_USER`, `SMTP_PASS` | identifiants SMTP (Resend : `resend` et une clé Resend) |
| `SMTP_ADMIN_EMAIL` | adresse d'expédition, sur un domaine vérifié |
| `SMTP_SENDER_NAME` | facultatif, `Learny` par défaut |

Le Compose configure déjà Supabase Auth avec les modèles Learny (`supabase/templates`, servis par
`auth-templates`) : le lien des e-mails mène à
`<LEARNY_PUBLIC_APP_URL>/api/v1/auth/callback?token_hash=…`, que l'application vérifie.

### Fournisseurs

| Variable | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | clé Anthropic de la plateforme (plus utilisée pour répondre aux tâches : aucun modèle n'est fourni, ADR-0340) |
| `VOYAGE_API_KEY` | clé Voyage |
| `RESEND_API_KEY` | clé Resend (e-mails de l'application) |
| `EMAIL_FROM` | `Learny <bonjour@exemple.fr>`, sur un domaine vérifié dans Resend |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:contact@exemple.fr` |
| `STRIPE_MODE` | `live` par défaut ; `test` accepté pour démarrer avec les clés de test |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | tableau de bord Stripe (même mode que `STRIPE_MODE`) |
| `STRIPE_WEBHOOK_SECRET` | secret du webhook créé en section 5 |
| `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOST_NAME` | mentions légales (`LEGAL_HOST_NAME` : l'hébergeur du serveur) |

### Facultatives

`APP_VERSION` (affichée par `/api/v1/health`), `LOG_LEVEL` (`info`), `DATABASE_POOL_MAX` (`10`
par conteneur), `GOTRUE_DISABLE_SIGNUP` (`false` ; `true` ferme les inscriptions),
`STORAGE_FILE_SIZE_LIMIT` (50 Mo), `SEARCH_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
`ALLOWED_ORIGINS`, `APP_ENCRYPTION_KEY_PREVIOUS` (rotation), `GIT_COMMIT` (empreinte du commit
livré, 7 à 40 caractères hexadécimaux, affichée par `/api/v1/health`). Ne reliez pas `GIT_COMMIT`
à `SOURCE_COMMIT` : Coolify y met `unknown` quand le commit n'est pas inclus au build, et
l'application refuse alors de démarrer.

Le Compose fixe le reste : `APP_ENV=production`, `LLM_MODE=live`, `PUSH_MODE=live`,
`JOBS_MODE=inngest`, `EMAIL_MODE=resend`, `TRUST_PROXY=true` (derrière le proxy Coolify) et
`ENABLE_SDD_PAGES=false`.

## 5. Premier déploiement et vérifications

Coolify construit sept images (le build Next.js du web prend plusieurs minutes), puis démarre la
pile dans l'ordre des dépendances : `db` → `storage` → `migrate` → `auth`, `rest` → `kong` ;
`inngest` → `api` ; enfin `web`. Au premier démarrage, `db` initialise le volume et donne aux
rôles Supabase le mot de passe `POSTGRES_PASSWORD`.

1. **Migrations** : les logs de `migrate` se terminent par
   `migrations : N appliquée(s), base à jour.` Chaque fichier est appliqué une seule fois, dans sa
   propre transaction, et enregistré avec son empreinte dans `public.selfhost_schema_migrations`.
   Aux déploiements suivants, seuls les nouveaux fichiers sont appliqués.
2. **Santé** : tous les services passent `healthy` (`rest` et `migrate` n'ont pas de sonde).
   `https://learny.exemple.fr/api/v1/health` répond `200`, et
   `https://api.learny.exemple.fr/auth/v1/health` aussi.
3. **Inscription** : créez un compte avec une boîte de test. L'e-mail reçu contient un lien vers
   `https://learny.exemple.fr/api/v1/auth/callback?token_hash=…`, qui doit ouvrir une session.
4. **Stripe** : dans le tableau de bord Stripe, créez un webhook vers
   `https://learny.exemple.fr/api/v1/webhooks/stripe` avec les événements
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` et `invoice.payment_failed`. Reportez son secret dans
   `STRIPE_WEBHOOK_SECRET`, puis redémarrez l'application.
5. **Pages publiques** : les CGU, la politique de confidentialité et les mentions légales
   s'affichent sans connexion. Les pages `/_dev/*` répondent 404.

## 6. Sauvegarder

Coolify nomme les conteneurs `<service>-<uuid de la ressource>` :
`docker ps --format '{{.Names}}' | grep '^db-'` donne celui de la base.

```bash
docker exec db-<uuid> pg_dump -U postgres -d postgres -Fc > "learny-$(date +%F).dump"
docker run --rm -v <uuid>_storage-data:/data:ro -v "$PWD":/backup alpine:3.22 \
  tar czf "/backup/learny-storage-$(date +%F).tgz" -C /data .
```

Vérifiez le nom exact du volume avec `docker volume ls | grep storage-data`. Sauvegardez avant
chaque mise à jour qui apporte des migrations, gardez les secrets de la section 2 avec les
sauvegardes (sans `SUPABASE_JWT_SECRET` ni `POSTGRES_PASSWORD`, une base restaurée est
inexploitable) et testez une restauration sur une machine isolée.

## 7. Mettre à jour, revenir en arrière

**Mise à jour** : fusionner sur `main`, puis **Deploy** dans Coolify. Les migrations s'appliquent
avant le démarrage du nouveau web et du nouveau api ; si l'une échoue, ils ne démarrent pas.
Prévoyez donc une courte coupure possible et une sauvegarde récente.

**Images tierces** : les versions de Supabase et d'Inngest sont épinglées (dans le Compose et dans
`docker/coolify-support.Dockerfile`), alignées sur `docker/compose.selfhost.yml`. Une montée de
version se fait en changeant explicitement les tags, après lecture des notes de version et une
sauvegarde ; jamais `latest`.

**Retour arrière** : redéployez le commit précédent depuis l'historique des déploiements Coolify.
Les migrations sont *forward-only* : une migration fautive se corrige par une nouvelle migration,
ou par la restauration de la sauvegarde. Ne modifiez jamais un fichier de migration déjà appliqué :
le job refuse une empreinte différente.

## 8. Dépannage

- **« required variable X is missing a value »** : renseignez `X` dans les variables de
  l'application.
- **`migrate` en échec** : ses logs nomment le fichier fautif. Ce fichier est annulé (une
  transaction par fichier) et rien n'est appliqué après lui ; `auth`, `rest`, `api` et `web`
  ne démarrent pas tant que les migrations n'ont pas réussi.
- **`auth`, `storage` ou `rest` refusent la connexion à la base** : `POSTGRES_PASSWORD` a changé
  depuis l'initialisation du volume `db-data` (section 2). Remettez l'ancienne valeur.
- **Web `unhealthy` ou qui redémarre en boucle** : au démarrage, l'application valide sa
  configuration et liste les variables manquantes ou invalides (jamais leurs valeurs). Sinon, la
  sonde du web nomme le composant injoignable (`✖ supabase-auth`, `✖ postgres`…).
- **Lien d'e-mail → « lien invalide »** : vérifiez que `auth` atteint les modèles
  (`docker exec auth-<uuid> wget -qO- http://auth-templates:8080/confirmation.html | head -5`) et
  que `LEARNY_PUBLIC_APP_URL` est bien l'URL publique du web.
- **E-mails d'inscription absents** : logs de `auth` (erreur SMTP) ; vérifiez `SMTP_*` et le
  domaine d'expédition.
- **Le web n'atteint pas l'API Supabase** : côté serveur, le web appelle Kong par son URL
  publique. Testez depuis le conteneur :
  `docker exec web-<uuid> node -e "fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/health').then(r => console.log(r.status))"`.

## 9. Sécurité et limites

- Aucun port n'est publié sur l'hôte : seuls `web` et `kong` reçoivent du trafic, par le proxy de
  Coolify. Les autres services restent sur le réseau de la ressource. Contrairement à la pile
  auto-hébergée, il n'y a pas de réseau interne séparé : Postgres, Auth et Storage peuvent sortir
  vers Internet.
- `web` et `api` tournent sans root, avec un système de fichiers en lecture seule et sans
  capacités Linux.
- Supabase Studio n'est pas inclus. Pour inspecter la base :
  `docker exec -it db-<uuid> psql -U postgres -d postgres`.
- Inngest stocke ses données dans SQLite, sur un seul nœud.
- Ce déploiement ne passe pas par `.github/workflows/deploy.yml` (Vercel) : les contrôles de
  région de `tools/deploy/check.mjs` ne s'appliquent pas. La région d'hébergement et les
  obligations de confidentialité (BR-PLA-04) sont celles de votre serveur.
- Pas de bascule automatique ni de sauvegarde gérée : elles dépendent de votre serveur Coolify.

## 10. Services Python de la bascule (SPEC-2301)

La bascule vers l'API et le worker Python (ADR-2007) ajoute **deux services à la même image**,
`docker/api-py.Dockerfile` (SPEC-2003), aux côtés de `api` (Hono), `web` et `migrate`. Ils sont
déclarés dans un fichier inclus par la pile — `docker/compose.coolify-py.yml` pour la production,
`docker/compose.coolify-qa-py.yml` pour la QA — et `docker/compose.coolify.yml` / `-qa.yml` portent
`include:`. Coolify déploie donc une seule ressource : le Compose résolu contient bien `api-py` et
`worker-py`. Le fichier inclus garde la page `/_dev/sdd/SPEC-1103` (qui énumère les services du
fichier principal) et sa ligne de base visuelle inchangées (ADR-1001, ADR-2008). Ils sont
désactivés de fait tant que `web` n'a pas basculé son `API_INTERNAL_URL` : la façade démarre en
**relais pur** vers Hono, et tout ce qui reste `ts` dans `api/ownership.yaml` lui est renvoyé tel
quel (ADR-2005).

| Service | Rôle | Commande | Sonde | Port interne |
|---|---|---|---|---|
| `api-py` | façade FastAPI : opérations `py`, relais `ts` | `uvicorn learny_api.main:app --port 8000 --workers 2` | `GET /health` | 8000 |
| `worker-py` | outbox, livraisons, planificateur singleton | `python -m learny_worker` | `GET /health/live` et `/health/ready` sur le port standard `PORT` | 8081 (sondes locales au conteneur) |

- **Une image, deux commandes** : la CI construit `docker/api-py.Dockerfile` à chaque commit
  (`.github/workflows/ci.yml`), et Coolify construit la même image depuis le Compose ; aucun
  registre ni secret de registre n'est nécessaire.
- **Limites de ressources** : `api-py` 2 vCPU / 2 Go, `worker-py` 1 vCPU / 1 Go
  (`deploy.resources.limits`), redémarrage `unless-stopped`, système de fichiers en lecture seule,
  `no-new-privileges`, toutes capacités Linux retirées.
- **Budget de connexions** : le pooler doit accepter au moins
  `répliques api × 2 processus × 5 connexions + répliques worker × 5 + Hono` : 2 processus uvicorn
  et un pool de 5 connexions sont des constantes du code depuis ADR-2042 (soit 35 connexions avec un
  worker et Hono).
- **Migrations** : le job `migrate` reste un singleton (`restart: 'no'`, image cible `migrate`) et
  `api-py`/`worker-py` attendent `service_completed_successfully`. Pour Supabase géré, le job de
  release est verrouillé : `flock /tmp/learny-migrate.lock node tools/deploy/migrate.mjs --env staging`.
- **Variables** (ADR-2042) : le backend Python ne lit que le contrat de
  `learny.shared.config.ENVIRONMENT_VARIABLES` — `APP_ENV`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET`, `APP_ENCRYPTION_KEY`, `API_PROXY_SECRET`, `EMAIL_LINK_SECRET`, `EMAIL_FROM`,
  `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_ID`, `VOYAGE_API_KEY`, `SEARCH_API_KEY` et les facultatives (rotation `*_PREVIOUS`,
  `SMTP_HOST`, `ALLOW_LOCAL_MODELS`, `ENABLE_SDD_PAGES`, `CLOCK_FIXED_AT`, `GIT_COMMIT`,
  `APP_VERSION`, `PY_HONO_UPSTREAM_URL` et `OWNERSHIP_OVERRIDES` jusqu'à SPEC-2302). Les modes
  (IA, push, e-mail, jobs, limiteur) sont dérivés d'`APP_ENV`, le mode Stripe de la clé secrète
  (`sk_live_` : live, autre : test), la clé du limiteur d'`APP_ENCRYPTION_KEY`, la clé publique
  et le sujet VAPID de `VAPID_PRIVATE_KEY` et d'`EMAIL_FROM` ; le réglage du worker, la taille du
  pool et le nombre de processus sont des constantes. **Aucune valeur de secret n'est écrite dans le dépôt** : la liste des
  noms est dans l'ancre `x-py-environment` des fichiers inclus (`docker/compose.coolify-py.yml`,
  `docker/compose.coolify-qa-py.yml`), les valeurs restent dans Coolify.
- **Surcharge de propriété** : `OWNERSHIP_OVERRIDES` n'est jamais saisie à la main, elle est
  produite par `node tools/deploy/cutover.mjs` (voir `docs/operations/python-cutover.md`) et lue au
  démarrage de `api-py` : chaque changement exige un redéploiement du service.
- **Bascule du web** : `API_INTERNAL_URL=http://api-py:8000` sur `web`, puis redéploiement. Le
  retour à `http://api:3001` est le rollback immédiat de cette étape ; la configuration versionnée
  reste volontairement sur Hono.

Les commandes de bascule, de drain, de rollback et de restauration sont dans
`docs/operations/python-cutover.md`. Les mesures de charge, de canary et de restauration se font sur
le staging fourni par le porteur (ADR-2009) ; tant qu'il manque, SPEC-2301 est bloquée `--external`
et le reste est prouvé en local.
