# Production sur Coolify avec un Supabase Coolify existant

Ce guide met Learny en production sur un serveur **Coolify** qui héberge déjà un **Supabase**
(service « Supabase » en un clic de Coolify). Learny n'apporte pas son propre Supabase : il se
branche sur celui qui tourne déjà, via le réseau Docker de Coolify.

Fichiers de référence :

- `docker/compose.coolify.yml` — la pile déployée par Coolify ;
- `docker/coolify-support.Dockerfile` — images d'appoint (migrations, modèles d'e-mails Auth,
  Inngest) ;
- `docker/web.Dockerfile`, `docker/worker.Dockerfile` — les images applicatives, identiques à
  l'auto-hébergement (`docs/operations/self-hosting.md`).

La production gérée de référence de SPEC-013 (Vercel, Supabase Cloud, Inngest Cloud) reste décrite
dans `docs/operations/deployment.md` ; ce guide en est une alternative auto-hébergée.

## 0. Ce qui tourne où

| Ressource Coolify | Conteneurs | Exposé publiquement |
|---|---|---|
| Supabase (existant) | `supabase-db`, `supabase-auth`, `supabase-storage`, `supabase-rest`, `supabase-kong`… | Kong uniquement (URL Supabase) |
| Learny (nouvelle application) | `learny-web` | oui (domaine de Learny) |
| | `learny-worker` (jobs Inngest, IA, e-mails) | non |
| | `learny-inngest` (Inngest auto-hébergé, SQLite) | non |
| | `learny-migrate` (job unique, s'arrête après les migrations) | non |
| | `learny-auth-templates` (modèles d'e-mails lus par Supabase Auth) | non |

`learny-web`, `learny-worker`, `learny-migrate` et `learny-auth-templates` rejoignent le réseau
Docker du Supabase. Ils parlent à Postgres en direct (`supabase-db-<uuid>:5432`), et Supabase Auth
lit les modèles d'e-mails sur `http://learny-auth-templates:8080`. Côté navigateur, l'application
parle à Supabase par l'URL publique de Kong.

## 1. Avant de commencer

### Un Supabase dédié à Learny (fortement recommandé)

Learny modifie son Supabase en profondeur :

- une soixantaine de tables, fonctions et politiques RLS dans le schéma `public` ;
- un déclencheur sur `auth.users` : **chaque** nouvel utilisateur Auth reçoit un profil Learny ;
- deux buckets Storage privés, `resources` et `exports` ;
- la configuration **globale** de Supabase Auth : URL du site, URL de redirection, modèles et
  sujets des e-mails de connexion.

Si votre Supabase sert déjà une autre application, ces changements la touchent aussi (e-mails
d'inscription qui pointent vers Learny, profils créés pour ses utilisateurs, collisions de noms de
tables). Dans ce cas, créez un **second** service Supabase dans Coolify, réservé à Learny, et
utilisez-le dans tout ce guide.

### Prérequis

- Learny et le Supabase sur le **même serveur** Coolify (un réseau Docker ne traverse pas les
  serveurs).
- L'URL publique de Kong en **HTTPS** : la production refuse une URL `http://`.
- Un domaine pour Learny (par exemple `learny.exemple.fr`) qui pointe vers le serveur.
- Les comptes et clés exigés en production (`PRODUCTION_REQUIRED_KEYS`, `packages/config`) :
  Anthropic, Voyage (embeddings), Resend avec un domaine d'envoi vérifié, Stripe (mode `live`, ou
  `test` pour commencer), une paire de clés VAPID, et les mentions légales.
- Une sauvegarde du Supabase avant la première migration (section 7).

## 2. Relever les informations du Supabase

Dans Coolify, ouvrez la ressource Supabase.

**UUID de la ressource** : c'est le dernier segment de l'URL de la page
(`…/service/<uuid>`). Coolify nomme les conteneurs `<service>-<uuid>`, par exemple
`supabase-db-<uuid>`. Vérifiez sur le serveur, en SSH :

```bash
docker ps --format '{{.Names}}' | grep supabase-db
```

**Réseau Docker** : en général, il porte le même nom que l'UUID. Vérifiez :

```bash
docker inspect supabase-db-<uuid> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

**Variables** (onglet *Environment Variables* du Supabase) :

| Variable du Supabase | Usage côté Learny |
|---|---|
| `SERVICE_PASSWORD_POSTGRES` | `SUPABASE_POSTGRES_PASSWORD` |
| `SERVICE_PASSWORD_JWT` | `SUPABASE_JWT_SECRET` |
| `SERVICE_SUPABASEANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SERVICE_SUPABASESERVICE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |
| `SERVICE_URL_SUPABASEKONG` (URL publique de Kong) | `LEARNY_PUBLIC_SUPABASE_URL` |

Le mot de passe Postgres est placé tel quel dans une URL de connexion. Ceux que génère Coolify sont
alphanumériques ; si le vôtre contient `@`, `:`, `/` ou `#`, encodez-le en pourcentage.

## 3. Créer l'application Learny dans Coolify

1. **+ New → Application**, source : le dépôt Git `hckmn732/learny`, branche `main`, sur le même
   serveur et la même destination que le Supabase.
2. **Build Pack** : `Docker Compose`.
3. **Base Directory** : `/docker`. **Docker Compose Location** : `/compose.coolify.yml`.
   Les contextes de build (`context: ..`) visent alors la racine du dépôt.
4. **Domaines** : sur le service `learny-web` uniquement, `https://learny.exemple.fr:3000`
   (le `:3000` indique le port interne à Coolify, il n'apparaît pas dans l'URL publique). Aucun
   domaine pour les autres services.
5. **Variables d'environnement** : section 4. Coolify bloque le déploiement tant qu'une variable
   obligatoire (`${VAR:?}` dans le Compose) est vide.
6. **Deploy**.

Conseil : désactivez le déploiement automatique à chaque push et déployez à la main (ou depuis un
tag) une fois la CI verte. Coolify déploie ce qui se trouve sur la branche, sans attendre la CI.

## 4. Variables d'environnement de l'application

### Supabase (relevées en section 2)

| Variable | Valeur |
|---|---|
| `SUPABASE_SERVICE_UUID` | UUID de la ressource Supabase |
| `SUPABASE_NETWORK` | nom du réseau Docker du Supabase (en général, le même UUID) |
| `SUPABASE_POSTGRES_PASSWORD` | `SERVICE_PASSWORD_POSTGRES` |
| `SUPABASE_JWT_SECRET` | `SERVICE_PASSWORD_JWT` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `SERVICE_SUPABASEANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_SUPABASESERVICE_KEY` |
| `LEARNY_PUBLIC_SUPABASE_URL` | URL publique HTTPS de Kong |

### Application

| Variable | Valeur |
|---|---|
| `LEARNY_PUBLIC_APP_URL` | `https://learny.exemple.fr` (sans barre finale) |

`LEARNY_PUBLIC_APP_URL`, `LEARNY_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont
**intégrées au build** du web. Après une modification, relancez un déploiement complet, pas un
simple redémarrage. Si votre version de Coolify propose l'option *Build Variable*, cochez-la pour
ces trois-là.

### Secrets générés

Générez-les en local, puis copiez-les dans Coolify :

```bash
node tools/docker/selfhost-secrets.mjs
```

Gardez uniquement `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `APP_ENCRYPTION_KEY`,
`RATE_LIMIT_IP_SECRET` et `EMAIL_LINK_SECRET`. Ignorez les quatre autres lignes : Postgres, JWT et
clés `anon`/`service_role` viennent de votre Supabase.

Conservez `APP_ENCRYPTION_KEY` dans un coffre de secrets. Elle chiffre les clés d'IA personnelles
des utilisateurs : si elle est perdue ou changée, ces clés deviennent illisibles. Pour une
rotation, voir `docs/operations/key-rotation.md`.

### Fournisseurs

| Variable | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | clé Anthropic |
| `VOYAGE_API_KEY` | clé Voyage |
| `RESEND_API_KEY` | clé Resend |
| `EMAIL_FROM` | `Learny <bonjour@exemple.fr>`, sur un domaine vérifié dans Resend |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:contact@exemple.fr` |
| `STRIPE_MODE` | `live` par défaut ; `test` accepté pour démarrer avec les clés de test |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | tableau de bord Stripe (même mode que `STRIPE_MODE`) |
| `STRIPE_WEBHOOK_SECRET` | secret du webhook créé en section 6 |
| `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOST_NAME` | mentions légales (`LEGAL_HOST_NAME` : l'hébergeur du serveur) |

### Facultatives

`APP_VERSION` (affichée par `/api/v1/health`), `LOG_LEVEL` (`info`), `DATABASE_POOL_MAX` (`10`
par conteneur), `SEARCH_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `ALLOWED_ORIGINS`,
`APP_ENCRYPTION_KEY_PREVIOUS` (rotation). `GIT_COMMIT` est repris de `SOURCE_COMMIT`, fourni par
Coolify.

Le Compose fixe le reste : `APP_ENV=production`, `LLM_MODE=live`, `PUSH_MODE=live`,
`JOBS_MODE=inngest`, `EMAIL_MODE=resend`, `TRUST_PROXY=true` (derrière le proxy Coolify) et
`ENABLE_SDD_PAGES=false`.

## 5. Configurer Supabase Auth pour Learny

Les e-mails d'inscription et de connexion de Learny contiennent un lien
`{{ .SiteURL }}/api/v1/auth/callback?token_hash=…` (`supabase/templates`). Les modèles par défaut
de Supabase pointent vers `/auth/v1/verify`, que Learny ne traite pas : sans cette étape, le lien
reçu par e-mail mène à la page « lien invalide ».

Après le premier déploiement de Learny (le serveur de modèles doit tourner), ajoutez ou modifiez ces
variables dans la ressource **Supabase**, puis redémarrez-la :

| Variable du Supabase | Valeur |
|---|---|
| `GOTRUE_SITE_URL` | `https://learny.exemple.fr` |
| `ADDITIONAL_REDIRECT_URLS` | `https://learny.exemple.fr/api/v1/auth/callback` |
| `ENABLE_EMAIL_AUTOCONFIRM` | `false` |
| `MAILER_TEMPLATES_CONFIRMATION` | `http://learny-auth-templates:8080/confirmation.html` |
| `MAILER_TEMPLATES_MAGIC_LINK` | `http://learny-auth-templates:8080/magic-link.html` |
| `MAILER_SUBJECTS_CONFIRMATION` | `Confirmez votre adresse e-mail` |
| `MAILER_SUBJECTS_MAGIC_LINK` | `Votre lien de connexion à Learny` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | votre SMTP. Avec Resend : `smtp.resend.com`, `465` ou `587`, utilisateur `resend`, mot de passe = une clé Resend |
| `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` | adresse d'expédition (domaine vérifié) et `Learny` |

Vérifiez ensuite que Supabase Auth atteint bien les modèles :

```bash
docker exec supabase-auth-<uuid> wget -qO- http://learny-auth-templates:8080/confirmation.html | head -5
```

## 6. Premier déploiement et vérifications

Au premier déploiement, Coolify construit cinq images (le build Next.js du web prend plusieurs
minutes). Il lance ensuite `learny-migrate`, puis Inngest, puis le worker et le web, qui
attendent tous deux la fin réussie des migrations.

1. **Migrations** : les logs de `learny-migrate` se terminent par
   `migrations : N appliquée(s), base à jour.` Chaque fichier est appliqué une seule fois, dans sa
   propre transaction, et enregistré avec son empreinte dans `public.selfhost_schema_migrations`.
   Aux déploiements suivants, seuls les nouveaux fichiers sont appliqués.
2. **Santé** : `learny-web` et `learny-worker` passent `healthy`, puis
   `https://learny.exemple.fr/api/v1/health` répond `200`. La sonde du web vérifie aussi Postgres,
   Auth, Storage, PostgREST et Inngest, et ses logs nomment le composant en échec.
3. **Inscription** : créez un compte avec une boîte de test. L'e-mail reçu contient un lien vers
   `https://learny.exemple.fr/api/v1/auth/callback?token_hash=…`, qui doit ouvrir une session.
4. **Stripe** : dans le tableau de bord Stripe, créez un webhook vers
   `https://learny.exemple.fr/api/v1/webhooks/stripe` avec les événements
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` et `invoice.payment_failed`. Reportez son secret dans
   `STRIPE_WEBHOOK_SECRET`, puis redémarrez l'application.
5. **Pages publiques** : les CGU, la politique de confidentialité et les mentions légales
   s'affichent sans connexion. Les pages `/_dev/*` répondent 404.

## 7. Sauvegarder, mettre à jour, revenir en arrière

**Sauvegarde** (avant chaque mise à jour qui apporte des migrations) :

```bash
docker exec supabase-db-<uuid> pg_dump -U postgres -d postgres -Fc > "learny-$(date +%F).dump"
```

Les fichiers Storage vivent dans le stockage S3 (MinIO) du Supabase Coolify : sauvegardez aussi son
volume. Le volume `inngest-data` de l'application ne contient que l'historique des jobs.

**Mise à jour** : fusionner sur `main`, puis **Deploy** dans Coolify. Les migrations s'appliquent
avant le démarrage du nouveau web et du nouveau worker ; si l'une échoue, ils ne démarrent pas.
Prévoyez donc une courte coupure possible et une sauvegarde récente.

**Retour arrière** : redéployez le commit précédent depuis l'historique des déploiements Coolify.
Les migrations sont *forward-only* : une migration fautive se corrige par une nouvelle migration,
ou par la restauration de la sauvegarde. Ne modifiez jamais un fichier de migration déjà appliqué :
le job refuse une empreinte différente.

## 8. Dépannage

- **« required variable X is missing a value »** : renseignez `X` dans les variables de
  l'application.
- **« network … declared as external, but could not be found »** : `SUPABASE_NETWORK` est faux ;
  revoyez la section 2. En repli, activez *Connect To Predefined Network* sur la ressource
  Supabase, redémarrez-la, puis mettez `SUPABASE_NETWORK=coolify`. Les noms `supabase-db-<uuid>`
  restent valables sur ce réseau.
- **`learny-migrate` en échec** : ses logs nomment le fichier fautif. Ce fichier est annulé (une
  transaction par fichier) et rien n'est appliqué après lui. Le web et le worker ne démarrent pas
  tant que les migrations n'ont pas réussi. Le Supabase Coolify tourne en Postgres 15,
  alors que la pile de référence utilise Postgres 17. Les 52 migrations existantes ont été
  appliquées sans erreur (puis rejouées sans effet) sur `supabase/postgres:15.8.1.085` avec
  `supabase/storage-api:v1.44.2`, les versions du modèle Coolify, le 2026-11-15. Une incompatibilité
  future se corrige par une nouvelle migration.
- **Web `unhealthy` ou qui redémarre en boucle** : au démarrage, l'application valide sa
  configuration et liste les variables manquantes ou invalides (jamais leurs valeurs). Sinon, la
  sonde indique le composant injoignable (`✖ supabase-auth`, `✖ postgres`…).
- **Lien d'e-mail → « lien invalide »** : revoyez `GOTRUE_SITE_URL` et `MAILER_TEMPLATES_*`
  (section 5), et vérifiez que Supabase Auth a été redémarré.
- **Le web n'atteint pas l'URL publique de Supabase** : le serveur appelle Kong par son URL
  publique. Testez depuis le conteneur :
  `docker exec learny-web-<uuid-app> node -e "fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/health').then(r => console.log(r.status))"`
  (une réponse `401` sans clé prouve que Kong est joignable).

## 9. Limites

- Inngest auto-hébergé stocke ses données dans SQLite, sur un seul nœud. Son interface n'a pas
  d'authentification : ne lui donnez pas de domaine public.
- Ce déploiement ne passe pas par le workflow `.github/workflows/deploy.yml` (Vercel). Les
  contrôles `tools/deploy/check.mjs` sur les régions ne s'appliquent pas : la région d'hébergement
  et les obligations de confidentialité (BR-PLA-04) sont celles de votre serveur.
- Pas de bascule automatique ni de sauvegarde gérée : elles dépendent de votre serveur Coolify.
