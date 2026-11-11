# Déploiement des environnements gérés

Normatif pour la mise en ligne de Learny (SPEC-013, BR-PLA-04). Ce guide décrit les environnements
preview et production sur Vercel, Supabase Cloud et Inngest Cloud. Les identifiants et projets
réels sont fournis **hors dépôt** par le porteur du projet : leur absence est un blocage externe
consigné (`sdd-process.md` §3), jamais contourné par une valeur fictive. Aucun déploiement réel
n'est annoncé dans ce document tant qu'il n'a pas été vérifié.

## 1. Matrice des environnements

| Environnement | Web | Base | Jobs | IA |
|---|---|---|---|---|
| `local` | `pnpm dev` (localhost:3000) | Supabase CLI (Docker) | Inngest Dev Server | modèle simulé par défaut (`LLM_MODE=mock`) |
| `test` (CI) | build + `next start` | Supabase CLI (Docker) | Inngest Dev Server | modèle simulé obligatoire (`LLM_MODE=mock`) |
| `preview` | Vercel preview (région `fra1`) | projet Supabase preview (UE) | branche Inngest dédiée | réel, plafond bas |
| `production` | Vercel production (`fra1`) | projet Supabase production (`eu-central-1`) | Inngest Cloud (UE) | réel |

Les routes sont identiques en preview et en production : `vercel.json` ne définit aucune réécriture
conditionnelle. Les données et les clés de production ne sont jamais utilisées dans une preview :
chaque environnement GitHub porte ses propres secrets préfixés (`PREVIEW_*`, `PRODUCTION_*`).

## 2. Régions européennes

`packages/config/src/platform.ts` est la source unique (`HOSTING_REGIONS`) :

| Service | Région attendue | Vérification |
|---|---|---|
| Vercel | `fra1` | `vercel.json` puis `deploy:check` |
| Supabase | `eu-central-1` | `SUPABASE_REGION` puis `deploy:check` |
| Inngest | `eu` | `INNGEST_REGION` puis `deploy:check` |

Toute valeur hors de la liste `EU_REGIONS` — ou toute valeur inattendue — provoque un échec avant
déploiement (CL-1). `vercel.json` applique les en-têtes de sécurité de base et interdit
l'indexation des pages SDD (`X-Robots-Tag: noindex, nofollow` sur `/_dev/*`). Aucune CSP n'y est
figée : la CSP à nonce est ajoutée par SPEC-805 (ET-5, ADR-0230).

## 3. Secrets et variables

Aucun secret n'est versionné. Les valeurs sont créées dans les environnements GitHub `preview` et
`production`, puis reportées dans les tableaux de bord des fournisseurs. Les variables publiques
`NEXT_PUBLIC_*` peuvent être des variables (`vars`) ; tout le reste est un secret (`secrets`).

### Environnement GitHub `preview`

| Nom | Type | Rôle |
|---|---|---|
| `PREVIEW_VERCEL_TOKEN` | secret | jeton Vercel de déploiement |
| `PREVIEW_VERCEL_PROJECT_ID` | variable | projet Vercel preview |
| `PREVIEW_APP_URL` | variable | URL stable fournie par Vercel |
| `PREVIEW_SUPABASE_URL`, `PREVIEW_SUPABASE_ANON_KEY` | variables | API Supabase preview |
| `PREVIEW_SUPABASE_SERVICE_ROLE_KEY`, `PREVIEW_SUPABASE_DB_URL`, `PREVIEW_DATABASE_URL` | secrets | rôle service et connexion directe preview |
| `PREVIEW_SUPABASE_ACCESS_TOKEN` | secret | CLI Supabase (migrations) |
| `PREVIEW_SUPABASE_REGION` | variable | `eu-central-1` |
| `PREVIEW_INNGEST_APP_URL`, `PREVIEW_INNGEST_REGION` | variables | branche Inngest et région `eu` |
| `PREVIEW_INNGEST_EVENT_KEY`, `PREVIEW_INNGEST_SIGNING_KEY` | secrets | clés Inngest preview |
| `PREVIEW_APP_ENCRYPTION_KEY`, `PREVIEW_RATE_LIMIT_IP_SECRET`, `PREVIEW_EMAIL_LINK_SECRET` | secrets | clés applicatives |
| `PREVIEW_ANTHROPIC_API_KEY`, `PREVIEW_RESEND_API_KEY` | secrets | IA et e-mail |

### Environnement GitHub `production`

Les mêmes rôles existent avec le préfixe `PRODUCTION_` et les exigences de
`PRODUCTION_REQUIRED_KEYS` (packages/config) : `PRODUCTION_APP_URL`,
`PRODUCTION_SUPABASE_URL`, `PRODUCTION_SUPABASE_ANON_KEY`, `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`,
`PRODUCTION_SUPABASE_DB_URL`, `PRODUCTION_DATABASE_URL`, `PRODUCTION_SUPABASE_ACCESS_TOKEN`,
`PRODUCTION_SUPABASE_BACKUP_REFERENCE`, `PRODUCTION_APP_ENCRYPTION_KEY`,
`PRODUCTION_INNGEST_EVENT_KEY`, `PRODUCTION_INNGEST_SIGNING_KEY`, `PRODUCTION_ANTHROPIC_API_KEY`,
`PRODUCTION_VOYAGE_API_KEY`, `PRODUCTION_RESEND_API_KEY`, `PRODUCTION_VAPID_PRIVATE_KEY`,
`PRODUCTION_STRIPE_SECRET_KEY`, `PRODUCTION_STRIPE_WEBHOOK_SECRET`,
`PRODUCTION_RATE_LIMIT_IP_SECRET`, `PRODUCTION_EMAIL_LINK_SECRET`, et les variables publiques
`PRODUCTION_VAPID_PUBLIC_KEY`, `PRODUCTION_STRIPE_PRICE_ID`,
`PRODUCTION_STRIPE_PUBLISHABLE_KEY`, `PRODUCTION_LEGAL_ENTITY_NAME`,
`PRODUCTION_LEGAL_ENTITY_ADDRESS`, `PRODUCTION_LEGAL_CONTACT_EMAIL`, `PRODUCTION_LEGAL_HOST_NAME`.

`VERCEL_ORG_ID` est commun ; les identifiants de projet Vercel sont distincts. Les secrets Supabase
et Inngest sont créés dans chaque projet/branche, jamais partagés entre preview et production.

### Fournisseurs

- **Vercel** : variables d'exécution identiques à celles de l'environnement GitHub correspondant
  (Production et Preview séparés dans le tableau de bord). Aucun secret n'est écrit dans
  `vercel.json`.
- **Supabase** : un projet preview et un projet production en UE ; renseigner `SUPABASE_REGION`.
  La clé `service_role` et la chaîne de connexion restent côté serveur.
- **Inngest** : une branche dédiée pour les previews et l'application de production ; renseigner
  `INNGEST_APP_URL`, `INNGEST_REGION=eu`, la clé d'événement et la clé de signature.
- **CLI verrouillées** : Supabase CLI `2.122.1`, Vercel CLI `48.2.0`, Node `24`, pnpm `10.34.9`.

## 4. Ordre de déploiement

Le workflow `.github/workflows/deploy.yml` démarre uniquement sur un run `CI` terminé avec succès,
pour la ref exacte (`head_sha`). Il sépare deux jobs et deux environnements GitHub.

### Preview (pull request)

1. vérifier la ref exacte validée par la CI ;
2. `tools/deploy/check.mjs --env preview` (régions, variables, ref, pages SDD, workflow) ;
3. migrations Supabase preview (`migrate.mjs --env preview`) ;
4. synchronisation Inngest de la branche ;
5. déploiement Vercel preview (l'URL est celle renvoyée par Vercel, jamais construite ici) ;
6. contrôle de fumée `GET /api/v1/health`.

Une preview ne référence aucun secret `PRODUCTION_*` et ne cible jamais `main`.

### Production (tag `v*` sur `main`)

1. vérifier la ref exacte et que le tag appartient à `main` (`git merge-base --is-ancestor`) ;
2. `tools/deploy/check.mjs --env production` (pages SDD explicitement désactivées) ;
3. vérifier `PRODUCTION_SUPABASE_BACKUP_REFERENCE` (point de restauration) ;
4. lister puis appliquer les migrations Supabase (arrêt au premier échec) ;
5. synchroniser les fonctions Inngest de la ref déployée ;
6. déployer Vercel en production (`--prod`) ;
7. contrôle de fumée `GET /api/v1/health`.

Une CI rouge ou un tag créé sur une autre branche ne déclenche pas la production (CL-3). Une étape
en erreur arrête la suite ; les logs sont expurgés et les secrets ne sont jamais publiés en sortie.

## 5. Migrations distantes

- `tools/deploy/migrate.mjs` exige `APP_ENV=preview|production` explicite.
- Il refuse une URL de base locale, liste les migrations distantes (`supabase migration list`)
  avant toute application, puis exécute `supabase db push --yes` avec des arguments séparés.
- Les migrations sont triées par version, appliquées une seule fois ; une version dupliquée ou un
  fichier mal nommé échoue. Un manifeste (`--manifest`) permet de refuser une migration déjà
  publiée dont l'empreinte SHA-256 a changé (EF-5).
- `--dry-run` ne contacte aucun service : il affiche les migrations locales candidates et
  n'exécute ni `db push` ni `db:reset`. `db:reset` reste interdit sur une base distante (CL-6,
  garde SPEC-008) et n'est jamais appelé par le workflow.
- Avant la production, fournir une sauvegarde ou un point de restauration documenté
  (`PRODUCTION_SUPABASE_BACKUP_REFERENCE`) ; sans référence, la migration réelle est refusée.

## 6. Retour arrière

1. **Web** : promouvoir le déploiement Vercel précédent (`vercel rollback <url>` ou promotion dans
   le tableau de bord), puis rejouer le contrôle de fumée. Ne jamais réécrire l'historique Git.
2. **Jobs** : resynchroniser la ref précédente dans Inngest ; désactiver les fonctions fautives
   avant de redéployer.
3. **Base** : les migrations sont *forward-only*. Une migration fautive est corrigée par une
   nouvelle migration ; en cas de perte, restaurer le point de restauration ou la sauvegarde
   `PRODUCTION_SUPABASE_BACKUP_REFERENCE` (PITR Supabase si activé). Toute restauration est
   consignée avec son horodatage et la migration fautive.
4. **Après retour arrière** : rejouer les vérifications post-déploiement et consigner le résultat.

## 7. Vérifications post-déploiement

- `GET /api/v1/health` répond `200` sur l'URL réellement renvoyée par le fournisseur.
- Pages légales accessibles sans connexion (CGU, confidentialité, mentions légales).
- Inscription/connexion avec une boîte de test, chargement d'un écran connecté.
- Un job Inngest de test est accepté et exécuté ; aucune fonction absente.
- Un e-mail de test est reçu par le transport attendu.
- Régions vérifiées (`fra1`, `eu-central-1`, `eu`), pages SDD inaccessibles en production.
- Logs, traces et rapports ne contiennent aucun token ni chaîne de connexion.

## 8. Vérification locale sans accès externe

Ces commandes fonctionnent sans identifiant et ne contactent aucun fournisseur :

```bash
node tools/deploy/check.mjs --env preview --dry-run
node tools/deploy/migrate.mjs --env preview --dry-run
node tools/deploy/sync-inngest.mjs --env preview --dry-run \
  --app-url https://exemple.invalid --region eu --commit 0000000
node tools/ci/check-workflows.mjs   # YAML + actionlint, aucun run GitHub prétendu
pnpm test:unit -t SPEC-013
pnpm test:int -t SPEC-013
```

En `--dry-run`, les destinations non vérifiées sont affichées « Non configuré » et masquées. Un
essai réel sans secrets échoue avec la liste des variables manquantes (code de sortie `2`,
configuration invalide) ; un service indisponible utilise le code `3`. Aucun résultat de
déploiement n'est inventé.

## 9. Blocages externes

Sans projets Vercel/Supabase/Inngest, sans jetons ni droits de migration, la preview et la
production ne peuvent pas être lancées. Le blocage est consigné dans `progress/blockers.md`
(`node tools/sdd/fail.mjs SPEC-013 "identifiants gérés absents" --external`) et les contrôles
statiques, `--dry-run` et les tests continuent. La décision de mise en production et le tag
`v1.0.0` relèvent de SPEC-808 après vérification réelle.
