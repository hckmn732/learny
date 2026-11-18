# Pile de QA sur Coolify

Ce guide met en ligne une **pile de recette** de Learny sur Coolify, pour la QA visuelle et
manuelle : même architecture que la production (`docs/operations/coolify.md`), mais avec des
données de démonstration et des fournisseurs simulés. Elle ne demande aucune clé de fournisseur
ni nom de domaine.

Fichiers de référence : `docker/compose.coolify-qa.yml` (la pile) et `docker/qa-seed.Dockerfile`
(job de chargement du jeu de démonstration). Décision : ADR-0330.

**Ne mettez jamais de données réelles dans cette pile**, et n'y réutilisez pas les secrets de la
production.

## 1. Ce qui change par rapport à la production

| Élément | Production | QA |
|---|---|---|
| Données | vides au départ | jeu de démonstration SPEC-115 (Alex Perrin, SAP S/4HANA Finance, agenda du 9 au 13 novembre…), rechargé à chaque déploiement |
| IA | Anthropic, Voyage | simulée (`LLM_MODE=mock`) : réponses déterministes des fixtures |
| Paiement | Stripe | simulé (`STRIPE_MODE=mock`) |
| Notifications push | envoyées | enregistrées, non envoyées (`PUSH_MODE=mock`) |
| E-mails | SMTP réel, Resend | tous reçus dans **Mailpit** (inscription, lien de connexion, rappels) |
| Horloge | réelle | figée au mercredi 11 novembre 2026, 13:20 à Paris (`CLOCK_FIXED_AT`, ADR-0047) |
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

Facultatives : `CLOCK_FIXED_AT` (un autre instant figé, format `2026-11-11T12:20:00Z`),
`ENABLE_SDD_PAGES=false` (masque les pages `/_dev`), `EMAIL_FROM`, `LEGAL_*` (mentions légales
affichées, fictives par défaut).

`LEARNY_PUBLIC_APP_URL`, `LEARNY_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont
intégrées au build du web : après une modification, redéployez.

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
  sont conservés.
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
- Les e-mails ne sortent jamais de la pile : ils sont tous capturés par Mailpit, et ses messages
  sont perdus au redémarrage.
- Le chargement de la démo passe par la garde de SPEC-115 (`APP_ENV=test`, hôte `.test`) : dans la
  pile, le job voit la base sous l'alias `db.learny.test`, limité à son seul conteneur. La
  production n'a pas de job `seed`.
