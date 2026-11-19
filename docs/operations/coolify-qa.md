# Pile de QA sur Coolify

Ce guide met en ligne une **pile de recette** de Learny sur Coolify, pour la QA visuelle et
manuelle : même architecture que la production (`docs/operations/coolify.md`), mais avec des
données de démonstration et des fournisseurs simulés. Elle ne demande aucune clé de fournisseur
ni nom de domaine.

Fichiers de référence : `docker/compose.coolify-qa.yml` (la pile) et `docker/qa-seed.Dockerfile`
(job de chargement du jeu de démonstration). Décisions : ADR-0330, ADR-0339.

Toutes les variables de l'application se pilotent depuis Coolify (section 4 bis) : sans variable
ajoutée, la pile reste la recette figée et simulée décrite ci-dessous ; avec les bonnes variables,
la même pile sert à une recette avec les vrais fournisseurs.

**Ne mettez jamais de données réelles dans cette pile**, et n'y réutilisez pas les secrets de la
production.

## 1. Ce qui change par rapport à la production

Valeurs **par défaut** de la pile de QA (toutes modifiables, section 4 bis) :

| Élément | Production | QA |
|---|---|---|
| Données | vides au départ | jeu de démonstration SPEC-115 (Alex Perrin, SAP S/4HANA Finance, agenda du 9 au 13 novembre…), rechargé à chaque déploiement |
| IA | Anthropic, Voyage | simulée (`LLM_MODE=mock`) : réponses déterministes des fixtures |
| Paiement | Stripe | simulé (`STRIPE_MODE=mock`) |
| Notifications push | envoyées | enregistrées, non envoyées (`PUSH_MODE=mock`) |
| E-mails | SMTP réel, Resend | tous reçus dans **Mailpit** (inscription, lien de connexion, rappels) |
| Horloge | réelle | figée au mercredi 11 novembre 2026, 13:20 à Paris (`CLOCK_FIXED_AT`, ADR-0047) |
| Limiteur de débit | actif | désactivé (`RATE_LIMIT_MODE=off`) : l'horloge figée empêche la recharge des seaux, un testeur y resterait bloqué (ADR-0336) |
| Pages `/_dev/sdd/*` | désactivées | activées (pages de démonstration des spécifications) |
| Limiteur de débit (SPEC-208) | actif, fenêtres réelles | **remis à zéro toutes les 5 minutes** : l'horloge figée empêche les seaux de se recharger d'eux-mêmes |

L'horloge figée est celle des maquettes et du jeu de démonstration : les écrans affichent les mêmes
dates que `design/maquettes/`, ce qui permet la comparaison visuelle. Les sessions de connexion
expirent quand même normalement (Supabase Auth suit l'heure réelle).

## 2. Des adresses sans nom de domaine

Coolify sait router des adresses `sslip.io`, qui pointent d'elles-mêmes vers l'IP contenue dans le
nom. Avec un serveur d'IP `203.0.113.10` :

| Service | Domaine dans Coolify |
|---|---|
| `web` | `https://qa.203.0.113.10.sslip.io:3000` |
| `kong` | `https://api-qa.203.0.113.10.sslip.io:8000` |
| `mailpit` | `https://mail-qa.203.0.113.10.sslip.io:8025` |

Le suffixe `:3000`, `:8000` ou `:8025` indique à Coolify le port interne ; il n'apparaît pas dans
l'URL publique. Coolify obtient les certificats HTTPS ; gardez le HTTPS (cookies de session,
installation de l'application). Le bouton *Generate Domain* de Coolify produit aussi une adresse
`sslip.io` si le domaine générique du serveur est configuré ainsi.

Quand votre nom de domaine sera actif, remplacez-les par exemple par `qa.learn-y.online`,
`api.qa.learn-y.online` et `mail.qa.learn-y.online`, puis redéployez (section 7).

## 3. Créer la ressource

1. **+ New → Application**, source : le dépôt `hckmn732/learny`, la branche à recetter.
2. **Build Pack** : `Docker Compose`. **Base Directory** : `/docker`.
   **Docker Compose Location** : `/compose.coolify-qa.yml`.
3. **Domaines** : les trois de la section 2, et aucun pour les autres services (`inngest` et `db`
   en particulier).
4. **Variables** : section 4.
5. **Advanced** : désactivez *Inject Build Args to Dockerfile* (sinon Coolify passe tous les
   secrets en arguments de build ; voir `docs/operations/coolify.md` §3).
6. **Deploy**. Le premier build prend 10 à 20 minutes (surtout le build Next.js).

La QA est une ressource distincte de la production : elle a ses propres volumes, secrets et
domaines. Elle peut tourner sur le même serveur.

## 4. Variables d'environnement

Générez des secrets **propres à la QA** :

```bash
node tools/docker/selfhost-secrets.mjs
```

Puis collez dans la vue développeur des variables de la ressource :

```env
# Les 9 lignes de tools/docker/selfhost-secrets.mjs
POSTGRES_PASSWORD=
SUPABASE_JWT_SECRET=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
APP_ENCRYPTION_KEY=
RATE_LIMIT_IP_SECRET=
EMAIL_LINK_SECRET=

# Domaines de la section 2 (sans barre finale)
LEARNY_PUBLIC_APP_URL=https://qa.203.0.113.10.sslip.io
LEARNY_PUBLIC_SUPABASE_URL=https://api-qa.203.0.113.10.sslip.io

# Accès à Mailpit (identifiant:mot de passe), à partager avec les testeurs
MAILPIT_UI_AUTH=qa:choisissez-un-mot-de-passe
```

Toutes les autres variables sont facultatives (section 4 bis).

`LEARNY_PUBLIC_APP_URL`, `LEARNY_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont
intégrées au build du web : après une modification, redéployez.

## 4 bis. Piloter la pile depuis Coolify

Chaque variable de l'application est lue dans `docker/compose.coolify-qa.yml` sous la forme
`${VARIABLE:-défaut}` : ajoutez-la dans **Environment Variables** de la ressource, puis
**redéployez** (les conteneurs ne relisent pas leurs variables à chaud). Une variable absente ou vide
reprend le défaut de recette. Coolify détecte ces variables et les liste d'office dans l'onglet,
pré-remplies avec leur défaut : modifiez la valeur, puis **Redeploy**.

| Groupe | Variables (défaut de recette) |
|---|---|
| Mode | `APP_ENV` (`local`) — `local`, `preview` ou `production` ; `LOG_LEVEL` (`info`) |
| IA | `LLM_MODE` (`mock`), `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `EMBEDDING_DIM` (`1024`), `SEARCH_API_KEY`, `DEEPGRAM_API_KEY`, `ALLOW_LOCAL_MODELS` (`false`) |
| Paiement | `STRIPE_MODE` (`mock`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Push | `PUSH_MODE` (`mock`), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:qa@learny.test`) |
| E-mails | `EMAIL_MODE` (`smtp` vers Mailpit), `SMTP_HOST` (`mailpit`), `SMTP_PORT` (`1025`), `EMAIL_FROM`, `RESEND_API_KEY` |
| Sécurité | `RATE_LIMIT_MODE` (`off`), `TRUST_PROXY` (`true`), `ALLOWED_ORIGINS`, `APP_ENCRYPTION_KEY_PREVIOUS` |
| Tâches | `JOBS_MODE` (`inngest`), `INNGEST_DEV` (`0`) |
| Base | `DATABASE_POOL_MAX` (`10`), `DB_LOG_QUERIES` (`false`) |
| Observabilité | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| Démo | `CLOCK_FIXED_AT` (`2026-11-11T12:20:00Z`), `ENABLE_SDD_PAGES` (`true`), `QA_SEED` (`on`) |
| Mentions légales | `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOST_NAME`, `LEGAL_CGU_VERSION`, `LEGAL_PRIVACY_VERSION` |

Restent fixes : `NODE_ENV=production` (build de production), `DATABASE_URL` (dérivée de
`POSTGRES_PASSWORD`), `INNGEST_BASE_URL` (Inngest interne à la pile).

`NEXT_PUBLIC_SENTRY_DSN` ne sert qu'au serveur : le bundle navigateur est construit sans DSN, le
signalement d'erreurs côté navigateur reste donc inactif dans cette pile. `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
et `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` sont lues à l'exécution et prises en compte au redéploiement.

**Horloge.** `CLOCK_FIXED_AT` absente ou vide = instant figé de la démo ; un autre instant ISO
(`2026-11-12T08:00:00Z`) fige l'horloge ailleurs ; **`real`** = horloge réelle. Avec l'horloge réelle, remettez aussi `RATE_LIMIT_MODE=on` et,
en général, `QA_SEED=off` : le jeu de démonstration est daté du 9 au 13 novembre 2026.

**Jeu de démonstration.** `QA_SEED=off` saute son chargement au déploiement (le job se termine
aussitôt) ; les données déjà présentes restent.

### Recette avec les vrais fournisseurs (`preview`, recommandée)

IA, embeddings et push réels, Stripe en **mode test**, e-mails toujours capturés par Mailpit :

```env
APP_ENV=preview
LLM_MODE=live
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_ID=price_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
PUSH_MODE=live
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
RATE_LIMIT_MODE=on
ENABLE_SDD_PAGES=false
CLOCK_FIXED_AT=real
QA_SEED=off
```

Pour de vrais envois d'e-mails, ajoutez `EMAIL_MODE=resend` et `RESEND_API_KEY` (sinon Mailpit).
Paire VAPID : `npx web-push generate-vapid-keys`.

### Recette en mode production

Même liste, avec `APP_ENV=production` et `RESEND_API_KEY` (exigée en production même si les
e-mails restent dans Mailpit). Gardez **`STRIPE_MODE=test`** avec des clés de test : `live`
déclencherait de vrais paiements. `NEXT_PUBLIC_APP_URL` et `NEXT_PUBLIC_SUPABASE_URL`
doivent être en `https://` (c'est le cas des adresses `sslip.io` de la section 2).

**Changer `APP_ENV` seul ne suffit pas** : les modes simulés de la recette restent actifs, et la
configuration refuse alors le démarrage en nommant chaque variable manquante ou interdite (logs du
service `web` dans Coolify). Les combinaisons interdites sont celles de `checkEnvironment`
(`packages/config/src/env.ts`).

## 5. Se connecter

**Comptes de démonstration** (sans mot de passe, connexion par lien) :

| Compte | Rôle dans le jeu |
|---|---|
| `alex.perrin@demo.learny.test` | persona principale des maquettes : 5 formations, série, agenda, lacunes, automatismes |
| `camille.roussel@demo.learny.test` | membre du groupe « Gestion de projet agile » |
| `hugo.marchand@demo.learny.test` | membre du groupe « Gestion de projet agile » |

Pour se connecter :

1. Sur la page de connexion, saisir l'adresse puis **Recevoir un lien de connexion**.
2. Ouvrir Mailpit (`https://mail-qa…`) avec l'identifiant et le mot de passe de
   `MAILPIT_UI_AUTH`.
3. Ouvrir l'e-mail « Votre lien de connexion à Learny » et cliquer sur le lien.

Les testeurs peuvent aussi **créer des comptes** avec n'importe quelle adresse (fictive de
préférence, par exemple `testeur1@learny.test`) : l'e-mail de confirmation arrive dans Mailpit.

Les pages de démonstration des spécifications sont sous `/_dev/sdd/SPEC-xxx`. Les maquettes de
référence s'ouvrent depuis `design/maquettes/index.html` dans le dépôt.

## 6. Contrôler le déploiement

- Logs de `migrate` : `migrations : N appliquée(s), base à jour.`
- Logs de `seed` : le résumé par table et les contrôles du jeu de démonstration (7 modules,
  48 notions, 3 formations actives, 2 terminées, 3 membres, agenda du 9 au 13 novembre). Une
  anomalie annule tout le chargement et fait échouer le job : le web ne démarre alors pas.
- `https://qa…/api/v1/health` répond `200` avec `"database":"ok"`.

## 7. Remettre à zéro, mettre à jour

- **Chaque déploiement** recharge le jeu de démonstration dans son état de référence : les
  modifications faites sur les données de démonstration sont écrasées, les comptes créés à la main
  sont conservés. `QA_SEED=off` désactive ce rechargement.
- **Remise à zéro complète** : arrêtez la ressource QA, supprimez ses volumes (`db-data`,
  `storage-data`, `inngest-data`) depuis Coolify, puis redéployez. Vérifiez bien qu'il s'agit de la
  ressource **QA** avant de supprimer quoi que ce soit.
- **Recetter une autre branche** : changez la branche de la ressource, puis redéployez. Les
  migrations de la nouvelle branche s'appliquent ; si une branche plus ancienne ne les connaît pas,
  faites une remise à zéro complète.

## 8. Précautions

- L'URL du web est publique : toute personne qui la connaît peut créer un compte. Ne la diffusez
  qu'aux testeurs.
- Mailpit est protégé par `MAILPIT_UI_AUTH` ; Inngest n'a pas de domaine.
- Par défaut, les e-mails ne sortent jamais de la pile : ils sont tous capturés par Mailpit, et ses
  messages sont perdus au redémarrage. Avec `EMAIL_MODE=resend`, ils partent réellement.
- Avec les vrais fournisseurs (section 4 bis) : clés **propres à la QA**, Stripe **en mode test
  uniquement**, et les appels IA sont facturés par Anthropic et Voyage.
- Le chargement de la démo passe par la garde de SPEC-115 (`APP_ENV=test`, hôte `.test`) : dans la
  pile, le job voit la base sous l'alias `db.learny.test`, limité à son seul conteneur. La
  production n'a pas de job `seed`.
