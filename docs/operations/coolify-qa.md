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
| IA | clés personnelles des utilisateurs (aucun modèle fourni, ADR-0340), Voyage pour les embeddings | simulée (`APP_ENV=local`) : réponses déterministes des fixtures |
| Paiement | Stripe | simulé (aucune clé Stripe) |
| Notifications push | envoyées | enregistrées, non envoyées (`APP_ENV=local`) |
| E-mails | SMTP réel, Resend | tous reçus dans **Mailpit** (inscription, lien de connexion, rappels) |
| Horloge | réelle | figée au mercredi 11 novembre 2026, 13:20 à Paris (`CLOCK_FIXED_AT`, ADR-0047) |
| Limiteur de débit | actif | désactivé (horloge figée hors production, ADR-0336) : l'horloge figée empêche la recharge des seaux, un testeur y resterait bloqué |
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
3. **Domaines** : les trois de la section 2, et aucun pour les autres services (`db`, `api-py`,
   `worker-py` en particulier).
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

Puis collez dans la vue développeur des variables de la ressource les cinq lignes générées, les
deux adresses publiques et l'accès à Mailpit :

```env
# Les 5 lignes de tools/docker/selfhost-secrets.mjs
POSTGRES_PASSWORD=
SUPABASE_JWT_SECRET=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENCRYPTION_KEY=

# Domaines de la section 2 (sans barre finale)
LEARNY_PUBLIC_APP_URL=https://qa.203.0.113.10.sslip.io
LEARNY_PUBLIC_SUPABASE_URL=https://api-qa.203.0.113.10.sslip.io

# Accès à Mailpit (identifiant:mot de passe), à partager avec les testeurs
MAILPIT_UI_AUTH=qa:choisissez-un-mot-de-passe
```

Le web et l'API doivent recevoir **la même `APP_ENCRYPTION_KEY`** : c'est la clé maîtresse qui
chiffre les clés d'IA personnelles et dont dérivent le secret du relais (`API_PROXY_SECRET`), celui
des liens e-mail, la paire VAPID et la clé du limiteur (ADR-4007). Ces secrets dérivés ne se
saisissent pas ; les modes (IA, Stripe, push, e-mails, jobs, limiteur) non plus : ils se déduisent
d'`APP_ENV`, de `CLOCK_FIXED_AT` et, pour Stripe, de la clé secrète.

Toutes les autres variables sont facultatives (section 4 bis). `LEARNY_PUBLIC_APP_URL`,
`LEARNY_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont intégrées au build du web :
après une modification, redéployez.

## 4 bis. Piloter la pile depuis Coolify

Chaque variable de l'application est lue dans `docker/compose.coolify-qa.yml` sous la forme
`${VARIABLE:-défaut}` : ajoutez-la dans **Environment Variables** de la ressource, puis
**redéployez** (les conteneurs ne relisent pas leurs variables à chaud). Une variable absente ou vide
reprend le défaut de recette. Coolify détecte ces variables et les liste d'office dans l'onglet,
pré-remplies avec leur défaut : modifiez la valeur, puis **Redeploy**.

Contrat minimal (ADR-4007) : les 7 variables obligatoires de la section 4 (les cinq secrets
générés et les deux URLs publiques), plus `MAILPIT_UI_AUTH` propre à la QA, puis les clés de
fournisseurs et les facultatives. Une variable retirée encore présente dans la ressource est
ignorée : supprimez-la.

| Groupe | Variables (défaut de recette) |
|---|---|
| Mode | `APP_ENV` (`local`) — `local`, `preview` ou `production` ; `APP_VERSION`, `GIT_COMMIT` (facultatives) |
| Fournisseurs | `VOYAGE_API_KEY`, `SEARCH_API_KEY` (facultative), `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Rotation | `APP_ENCRYPTION_KEY_PREVIOUS` |
| Démo | `CLOCK_FIXED_AT` (`2026-11-11T12:20:00Z`), `ENABLE_SDD_PAGES` (`true`), `QA_SEED` (`on`) |
| Accès | `MAILPIT_UI_AUTH` (obligatoire) |

Restent fixes dans le Compose : `NODE_ENV=production`, `LOG_LEVEL=info`, `EMAIL_FROM`
(`qa@learny.test`) et `SMTP_HOST=mailpit` (tous les e-mails de l'application et de Supabase Auth
restent dans Mailpit), `DATABASE_URL` (dérivée de `POSTGRES_PASSWORD`) et les constantes du pool.
**Sentry n'est plus configurable par la pile** : `SENTRY_DSN` et `NEXT_PUBLIC_SENTRY_DSN` n'y sont
plus transmis (le web les lit encore s'ils sont fournis hors pile).

**Horloge.** `CLOCK_FIXED_AT` absente ou vide = instant figé de la démo ; un autre instant ISO
(`2026-11-12T08:00:00Z`) fige l'horloge ailleurs ; **`real`** = horloge réelle. Avec l'horloge
réelle, remettez aussi `QA_SEED=off` : le jeu de démonstration est daté du 9 au 13 novembre 2026.

**Jeu de démonstration.** `QA_SEED=off` saute son chargement au déploiement (le job se termine
aussitôt) ; les données déjà présentes restent.

### Recette avec les vrais fournisseurs (`preview`, recommandée)

IA, embeddings et push réels, Stripe en **mode test**, e-mails toujours capturés par Mailpit. La
plateforme ne fournit aucun modèle (ADR-0340) : chaque testeur enregistre sa propre clé dans
Paramètres › Modèles d'IA et choisit lui-même le modèle de chaque tâche :

```env
APP_ENV=preview
VOYAGE_API_KEY=
SEARCH_API_KEY=
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_ID=price_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
CLOCK_FIXED_AT=real
ENABLE_SDD_PAGES=false
QA_SEED=off
```

`APP_ENV=preview` rend l'IA et le push réels ; le mode Stripe suit la clé secrète (`sk_test_…` :
test, `sk_live_…` : live, aucune : simulé) : gardez des clés de **test**. `CLOCK_FIXED_AT=real`
remet le limiteur et `QA_SEED=off` arrête le rechargement de la démo.

Les e-mails restent capturés par Mailpit : `SMTP_HOST=mailpit` et `EMAIL_FROM=qa@learny.test` sont
des littéraux de la pile, et `RESEND_API_KEY` n'y change rien.

**Services Python (`api-py`, `worker-py`, ADR-2042, ADR-4007).** Ils ne lisent aucun mode :
`APP_ENV=preview` donne l'IA et le push réels, le mode Stripe suit la clé, `CLOCK_FIXED_AT=real`
remet le limiteur, et les e-mails partent vers Mailpit. La paire VAPID, les secrets des liens
e-mail et du relais, et la clé du limiteur sont dérivés d'`APP_ENCRYPTION_KEY` : aucune de ces
valeurs n'est à saisir.

### Recette en mode production

Même liste, avec `APP_ENV=production` et `RESEND_API_KEY` (exigée par la garde de production même
si les e-mails restent dans Mailpit). Gardez des clés Stripe de **test** : `live` déclencherait de
vrais paiements. `NEXT_PUBLIC_APP_URL` et `NEXT_PUBLIC_SUPABASE_URL` doivent être en `https://`
(c'est le cas des adresses `sslip.io` de la section 2).

**Changer `APP_ENV` seul ne suffit pas** : en `production`, la configuration refuse
`CLOCK_FIXED_AT` figé et `ENABLE_SDD_PAGES=true`, et nomme chaque variable manquante ou interdite
(logs du service `web` dans Coolify). Les combinaisons interdites sont celles de `checkEnvironment`
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
  `storage-data`) depuis Coolify, puis redéployez. Vérifiez bien qu'il s'agit de la
  ressource **QA** avant de supprimer quoi que ce soit.
- **Recetter une autre branche** : changez la branche de la ressource, puis redéployez. Les
  migrations de la nouvelle branche s'appliquent ; si une branche plus ancienne ne les connaît pas,
  faites une remise à zéro complète.

## 8. Précautions

- L'URL du web est publique : toute personne qui la connaît peut créer un compte. Ne la diffusez
  qu'aux testeurs.
- Mailpit est protégé par `MAILPIT_UI_AUTH` et n'a pas d'autre domaine que celui de la section 2.
- Dans cette pile, les e-mails ne sortent jamais : le SMTP est un littéral vers Mailpit (ADR-4007)
  et les messages sont perdus au redémarrage. Pour de vrais envois, utilisez la pile de production
  (`docs/operations/coolify.md`).
- Avec les vrais fournisseurs (section 4 bis) : clés **propres à la QA**, Stripe **en mode test
  uniquement**, et les appels IA sont facturés par Voyage et par le fournisseur de la clé
  personnelle du testeur.
- Le chargement de la démo passe par la garde de SPEC-115 (`APP_ENV=test`, hôte `.test`) : dans la
  pile, le job voit la base sous l'alias `db.learny.test`, limité à son seul conteneur. La
  production n'a pas de job `seed`.
