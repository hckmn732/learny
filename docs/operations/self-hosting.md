# Auto-hébergement de Learny

Ce guide décrit l'option Docker complète de Learny : deux images applicatives (`web`, `api` — la
façade FastAPI et le worker Python, ADR-2043) et un Supabase auto-hébergé (Postgres, Auth,
Storage, API PostgREST derrière Kong). **Ce n'est pas la production gérée de la V1** : les
environnements gérés (Vercel, Supabase Cloud) restent la cible de référence et sont décrits dans
`docs/operations/deployment.md` (SPEC-013). L'auto-hébergement convient à une installation privée
ou à une évaluation, pas à une promesse de service sans exploitation.

Pour déployer la même pile complète sur **Coolify** (une seule ressource, sans bind mount ni port
publié), suivez plutôt `docs/operations/coolify.md` (`docker/compose.coolify.yml`, ADR-0329).

Les décisions sont consignées dans ADR-0053, ADR-0227 et ADR-0228. Le fichier de référence est
`docker/compose.selfhost.yml` ; les versions des images tierces y sont épinglées et ne doivent pas
être remplacées par `latest`.

## 1. Prérequis

- Docker Engine 24 ou plus récent et Docker Compose v2 (`docker compose version`).
- Une machine Linux avec au moins 4 vCPU, 8 Go de RAM et 20 Go d'espace disque libre.
- Les images de base suivantes, tirées au premier démarrage : `node:24.22.3-alpine3.24`,
  `public.ecr.aws/supabase/postgres:17.11.0.006`,
  `public.ecr.aws/supabase/gotrue:v2.197.0`, `public.ecr.aws/supabase/postgrest:v16.5`,
  `public.ecr.aws/supabase/storage-api:v1.84.19`, `public.ecr.aws/supabase/kong:2.8.1`.
  Mailpit (`axllent/mailpit:v1.33.1`) n'est nécessaire qu'en local.
- Un nom de domaine et un reverse proxy TLS (Caddy, Traefik ou nginx) devant les ports publiés.
  Aucun certificat n'est géré par le Compose lui-même.

Vérifiez l'outillage et la configuration avant tout démarrage :

```bash
docker compose version
node tools/docker/check-selfhost.mjs --env-file .env.selfhost
```

Sans Docker, ce contrôle reste possible en mode statique et l'échec d'exécution est alors consigné
comme blocage externe, sans prétendre que la pile a démarré.

## 2. Secrets

Tous les secrets viennent d'un fichier local non versionné, `.env.selfhost`, ignoré par Git
(`.env.*`). Le modèle versionné reste `.env.example` : copiez-le, puis remplacez les valeurs
propres à l'auto-hébergement.

```bash
cp .env.example .env.selfhost
chmod 600 .env.selfhost
node tools/docker/selfhost-secrets.mjs > /tmp/learny-secrets.env
# Reportez les valeurs générées dans .env.selfhost (les lignes vides correspondantes).
```

Le générateur produit les cinq secrets de la pile : `POSTGRES_PASSWORD`, `SUPABASE_JWT_SECRET`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (clés `anon` et `service_role`
signées avec ce secret JWT) et `APP_ENCRYPTION_KEY`. Les secrets internes (relais du web vers
l'API, liens e-mail, paire VAPID, clé du limiteur) sont dérivés d'`APP_ENCRYPTION_KEY` (ADR-4007) :
il n'y a plus rien à générer ni à recopier pour eux. Renseignez ensuite :

- `LEARNY_PUBLIC_APP_URL` (URL publique du web, par exemple `https://learny.example`) et
  `LEARNY_PUBLIC_SUPABASE_URL` (URL publique de Kong, par exemple `https://api.learny.example`) ;
- `GIT_COMMIT` avec `git rev-parse HEAD` et `APP_VERSION` avec la version livrée ;
- les clés des fournisseurs que vous activez : `EMAIL_FROM` (expéditeur affiché),
  `VOYAGE_API_KEY` pour les embeddings, `SEARCH_API_KEY` pour la recherche de repli, et
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` pour Stripe ;
- `APP_ENCRYPTION_KEY_PREVIOUS`, seulement pendant une rotation (facultative).

Le Compose fixe le reste : les e-mails de l'application et de Supabase Auth partent vers Mailpit
(`SMTP_HOST=mailpit`, port `1025`), les modes sont dérivés d'`APP_ENV` (le mode Stripe suit la
clé secrète), et la taille du pool comme les schémas PostgREST sont des constantes. Aucune
variable `SMTP_*`, `*_MODE` ni `VAPID_*` n'est à saisir ; `RESEND_API_KEY` n'est pas utilisée par
cette pile, dont tous les e-mails restent dans Mailpit.

Ne versionnez jamais `.env.selfhost`, ne le copiez pas dans une image et ne l'affichez pas dans un
journal. Les substitutions obligatoires utilisent la syntaxe `:?` : si une valeur manque,
`docker compose config` échoue **avant** de créer le moindre conteneur, avec le nom de la variable
et jamais sa valeur.

## 3. Démarrer la pile

Validez d'abord la configuration résolue, sans secret affiché :

```bash
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml config --quiet
```

Puis construisez les deux images depuis le même commit et démarrez :

```bash
GIT_COMMIT="$(git rev-parse HEAD)" docker compose --env-file .env.selfhost \
  -f docker/compose.selfhost.yml up -d --build
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml ps
```

Les deux images portent l'étiquette `org.opencontainers.image.revision` ; elle doit être identique
pour `web` et `api`. Le web écoute sur `LEARNY_WEB_PORT` (8080 par défaut) et Kong sur
`LEARNY_SUPABASE_PORT` (8000) ; avec le profil `local`, Mailpit publie `LEARNY_MAILPIT_UI_PORT`
(8025) et `LEARNY_MAILPIT_SMTP_PORT` (1025). Postgres, Auth, Storage, PostgREST, l'API et le
worker ne sont pas publiés sur l'hôte.

Pour un essai local avec le capteur d'e-mails Mailpit, ajoutez le profil `local` :

```bash
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml \
  --profile local up -d --build
```

Mailpit n'est démarré que par ce profil : sans lui, `web` et `api` démarrent mais aucun e-mail ne
part. Le transport est un littéral de la pile vers Mailpit (ADR-4007) ; cette pile d'évaluation ne
configure pas de SMTP réel, et la production est décrite dans `docs/operations/coolify.md`.

## 4. Appliquer les migrations

Le service `migrate` s'exécute à chaque démarrage, après que Postgres est sain, et avant `web`,
`api`, Auth et Storage. Il monte `supabase/migrations` en lecture seule et applique chaque
fichier une seule fois, dans l'ordre lexical, dans sa propre transaction. Chaque application est
enregistrée avec son empreinte SHA-256 dans `public.selfhost_schema_migrations`.

```bash
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml \
  run --rm migrate
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml \
  exec -T db psql -U postgres -d postgres -c \
  "select name, applied_at from public.selfhost_schema_migrations order by name"
```

Une migration déjà appliquée n'est jamais rejouée ; si un fichier est modifié après application,
le runner s'arrête avec une empreinte différente au lieu de produire un changement destructif. Une
nouvelle migration s'ajoute toujours dans un nouveau fichier, jamais en réécrivant un fichier
fusionné.

## 5. Contrôler la santé

```bash
node tools/docker/check-selfhost.mjs --env-file .env.selfhost
node tools/docker/check-selfhost.mjs --env-file .env.selfhost --up --project learny-selfhost
```

Le second contrôle construit et démarre réellement la pile dans un projet Compose isolé, puis
vérifie les sondes. Les contrôles disponibles sont :

| Composant | Sonde | Attendu |
|---|---|---|
| web | `GET /api/v1/health` | HTTP 200, base non `unavailable` |
| api | `GET /health` | `{"status":"ok"}` |
| Postgres | `pg_isready -U postgres` | `accepting connections` |
| Auth | `GET /health` | HTTP 200 |
| Storage | `GET /status` | HTTP 200 |
| PostgREST | `GET /` via le réseau interne | HTTP 200 |
| Kong | `kong health` | `Kong is healthy` |

Le contrôle de santé du conteneur `web` interroge l'API, la base, Auth, Storage et PostgREST. Si
une dépendance obligatoire devient indisponible, `web` passe `unhealthy` ; le Compose
ne présente donc jamais un web sain alors que la base est arrêtée. Un état `degraded` de l'API n'est
pas converti en `ok` fictif.

## 6. Sauvegarder

Sauvegardez toujours avant une mise à jour ou une migration. Les données vivent dans les volumes
nommés `learny-selfhost_db-data` et `learny-selfhost_storage-data` (le préfixe est le nom du
projet Compose).

```bash
mkdir -p backups
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml \
  exec -T db pg_dump -U postgres -d postgres -Fc > "backups/learny-$(date +%F).dump"
docker run --rm \
  -v learny-selfhost_storage-data:/data:ro \
  -v "$PWD/backups":/backup \
  public.ecr.aws/supabase/postgres:17.11.0.006 \
  tar czf "/backup/storage-$(date +%F).tgz" -C /data .
```

Conservez aussi une copie de `.env.selfhost` dans un coffre de secrets : sans
`SUPABASE_JWT_SECRET` ni `APP_ENCRYPTION_KEY`, les sauvegardes de données ne suffisent pas à
retrouver des sessions valides ni à déchiffrer les clés IA personnelles. Testez la restauration
sur une machine isolée avant d'en dépendre.

## 7. Mettre à jour les images

Les images applicatives se mettent à jour ensemble, depuis un commit unique :

```bash
git fetch --tags
git checkout <tag-ou-commit>
# Sauvegardez d'abord (section 6), puis :
GIT_COMMIT="$(git rev-parse HEAD)" docker compose --env-file .env.selfhost \
  -f docker/compose.selfhost.yml build --pull web api-py
GIT_COMMIT="$(git rev-parse HEAD)" docker compose --env-file .env.selfhost \
  -f docker/compose.selfhost.yml up -d --no-deps web api-py worker-py
node tools/docker/check-selfhost.mjs --env-file .env.selfhost
```

Les images tierces (Supabase, Mailpit) sont épinglées dans `docker/compose.selfhost.yml`.
Une mise à jour coordonnée consiste à changer explicitement leurs tags, à lire leurs notes de
version, à sauvegarder les données, puis à recréer les services et à vérifier les migrations. Ne
remplacez jamais un tag par `latest` : les versions doivent rester reproductibles. Un retour
arrière se fait avec les mêmes commandes et le tag précédent, après restauration de la sauvegarde
si une migration a modifié le schéma.

## 8. Arrêter sans perdre les volumes

```bash
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml down
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml stop
docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml start
```

`down` arrête et supprime les conteneurs et le réseau, mais conserve les volumes nommés. Un
redémarrage (`start`, ou un nouveau `up -d`) retrouve les données Postgres et Storage ainsi que
les migrations déjà appliquées. N'ajoutez jamais l'option de suppression des volumes à
la commande d'arrêt : la suppression est une opération distincte, explicite et destructive, à
n'exécuter qu'après une sauvegarde vérifiée.

## 9. Dépannage

- **Variable obligatoire manquante** : `docker compose config` échoue en nommant la variable ;
  complétez `.env.selfhost`, ne mettez pas de valeur par défaut dans le Compose.
- **Web `unhealthy`** : `docker compose logs web` puis `docker compose exec -T db pg_isready`.
  Le contrôle web échoue aussi quand Auth, Storage, PostgREST ou l'API sont indisponibles.
- **Auth ou Storage en boucle** : vérifiez que `migrate` s'est terminé avec le code 0 et que les
  rôles Supabase (`supabase_auth_admin`, `supabase_storage_admin`) existent ; l'image Postgres
  épinglée les crée à l'initialisation.
- **E-mails absents** : sans profil `local`, Mailpit n'existe pas et les e-mails d'inscription et
  de connexion ne partent pas. Démarrez la pile avec `--profile local` et ouvrez l'interface sur
  `LEARNY_MAILPIT_UI_PORT`.
- **Port déjà utilisé** : changez `LEARNY_WEB_PORT`, `LEARNY_SUPABASE_PORT`,
  `LEARNY_MAILPIT_UI_PORT` ou `LEARNY_MAILPIT_SMTP_PORT` dans `.env.selfhost`.

## 10. Sécurité et limites

Seuls `web`, Kong et (avec le profil local) Mailpit publient un port. Placez un reverse proxy TLS
devant `web` et Kong, limitez l'accès à l'interface Mailpit, et n'exposez jamais Postgres. Les
images `web` et `api` s'exécutent sous l'utilisateur non root `node`, avec un système de fichiers
en lecture seule et sans capacités Linux. Les secrets sont fournis à l'exécution ; seules les
variables `NEXT_PUBLIC_*` nécessaires sont passées au build.

L'auto-hébergement ne remplace pas les garanties de la production gérée : pas de bascule
automatique, pas de supervision centralisée, pas de sauvegarde managée. La région d'hébergement et
les obligations de confidentialité restent celles du déployeur (BR-PLA-04).
