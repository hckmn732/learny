---
id: SPEC-008
title: Environnement local Docker
phase: P0
priority: V1
depends_on: [SPEC-006, SPEC-007]
business_rules: []
screens: []
adrs: [ADR-0006, ADR-0053, ADR-0054]
visual: demo
---

# SPEC-008 — Environnement local Docker

## 1. Objectif

Fournir une pile locale reproductible pour Postgres/Supabase, Inngest Dev Server et Mailpit, avec commandes de démarrage, d'arrêt, de remise à zéro et de contrôle de santé. Cette pile sert aux tests d'intégration et à l'implémentation des phases suivantes ; elle n'est pas le déploiement auto-hébergé de SPEC-012.

## 2. Contexte

Lire ADR-0006, ADR-0053, ADR-0054, `docs/architecture/overview.md` §2, §5–§6, `docs/engineering/testing.md` §3–§4, `.env.example` et `docs/engineering/conventions.md` §7. SPEC-006 fournit la route de santé web ; SPEC-007 fournit les hôtes Inngest. La base locale doit disposer des extensions prévues par `docs/architecture/data-model.md`, même si les tables Drizzle arrivent avec SPEC-101. Mailpit reçoit les e-mails en local, sans accès au transport Resend.

## 3. Dépendances

- **SPEC-006** : application web et santé ; aucune table métier n'est requise pour lancer la pile.
- **SPEC-007** : route Inngest et worker ; le Dev Server peut découvrir les fonctions web à l'URL locale configurée.
- **Système** : Docker Engine/Compose et Supabase CLI 2, Node 24/pnpm 10. Si Docker est absent ou ne démarre pas, consigner un blocage externe ; les scripts de configuration et leurs tests unitaires restent réalisables.
- **Ports locaux** : Supabase CLI utilise ceux de `supabase/config.toml`; Inngest `8288`, Mailpit SMTP `1025` et interface `8025`. Une collision produit un diagnostic, pas un changement silencieux de port.

## 4. Règles métier couvertes

Aucune règle `BR-*` directement. La pile prépare le stockage UE de BR-PLA-04 mais un environnement local ne constitue pas une preuve de région de production.

## 5. Exigences fonctionnelles

- **EF-1** — `pnpm dev:up` vérifie Docker et Supabase CLI, démarre Supabase local puis le Compose de développement Inngest/Mailpit, attend leurs contrôles de santé et affiche les URL utiles sans secret. Une seconde invocation est idempotente et n'efface aucune donnée.
- **EF-2** — `pnpm dev:down` arrête les services de cette pile sans supprimer les volumes de données ; la commande retourne un code non nul si un arrêt échoue et indique le service concerné.
- **EF-3** — `pnpm db:reset` applique les migrations présentes puis la seed minimale dans la base locale, avec avertissement explicite avant la remise à zéro hors CI ; `pnpm db:seed:demo` appelle le jeu de données SPEC-115 lorsqu'il existe et, avant SPEC-115, indique « seed de démonstration non disponible » plutôt que réussir à vide.
- **EF-4** — Postgres local active `vector`, `unaccent`, `pg_trgm`, `pgcrypto` ; les extensions sont vérifiées par une requête dans le contrôle de santé. Le stockage et l'Auth Supabase sont accessibles seulement sur l'hôte local selon `config.toml`.
- **EF-5** — Inngest Dev Server reçoit les fonctions de `apps/web` et affiche au moins le job de démonstration SPEC-007 ; Mailpit accepte un message SMTP factice et l'expose dans son interface/API locale. Aucune requête de test n'est envoyée à Resend.
- **EF-6** — `pnpm dev:check` rend un résultat par service (`supabase`, `postgres`, `inngest`, `mailpit`, `web`) avec état `ok`/`failed` et cause lisible ; la commande échoue si un service obligatoire ou une extension manque.
- **EF-7** — Le README donne les prérequis, commandes dans l'ordre, URL locales, reprise après un port occupé, remise à zéro de la base et séparation entre secrets locaux non suivis et `.env.example` versionné.

## 6. Exigences techniques

- **ET-1** — `supabase/config.toml` configure API, Auth, Storage et DB pour le local, avec ports déclarés et migrations dans `supabase/migrations/`. Les extensions sont créées par migration d'amorçage idempotente ; ne pas modifier une migration fusionnée ultérieurement.
- **ET-2** — `docker/compose.dev.yml` contient `inngest` et `mailpit` avec images épinglées à des versions, contrôles de santé, `restart` adapté au développement, volumes nommés si nécessaires et variables non secrètes. Ne pas monter de clé de production dans un conteneur local.
- **ET-3** — `tools/dev/up.mjs`, `down.mjs`, `check.mjs`, `db-reset.mjs`, `db-seed-demo.mjs` utilisent `spawn` avec arguments séparés, propagent les codes de sortie et ne construisent aucune commande shell à partir de l'entrée utilisateur. Les URLs/ports sont lus depuis la configuration, pas copiés dans chaque script.
- **ET-4** — `db:reset` refuse de fonctionner si `APP_ENV=production`, `preview` ou si `DATABASE_URL` ne pointe pas explicitement vers une adresse locale autorisée. Le test vérifie ce garde avant tout appel à Supabase CLI.
- **ET-5** — Les contrôles HTTP ont un délai borné et des reprises de connexion, sans `sleep` arbitraire ; Postgres est interrogé sur `pg_extension`, Inngest sur son endpoint de santé, Mailpit sur son API locale, web sur `/api/v1/health`.
- **ET-6** — Les tests CI utilisent `EMAIL_MODE=memory`, `LLM_MODE=mock`, `STRIPE_MODE=mock`; les services locaux ne requièrent aucune clé externe. `.env.example` décrit les valeurs nécessaires sans contenu secret.

## 7. Comportements attendus et cas limites

- **CL-1** — Docker indisponible : `dev:up` échoue immédiatement avec une commande de diagnostic ; pas de pile partiellement déclarée opérationnelle.
- **CL-2** — Port occupé : nom du service et port affichés, code non nul ; aucun basculement de port non déclaré.
- **CL-3** — `dev:up` relancé : services déjà sains réutilisés ; volumes intacts.
- **CL-4** — Extension SQL absente : `dev:check` échoue avec la liste précise ; SPEC-101 ne démarre pas sur une base incomplète.
- **CL-5** — Base distante dans `DATABASE_URL` : `db:reset` refuse sans exécuter de migration ou de suppression.
- **CL-6** — SPEC-115 absente : `db:seed:demo` échoue explicitement, sans seed partielle.
- **CL-7** — Inngest ou Mailpit lent à démarrer : attente bornée ; résultat distinguant délai et erreur de configuration.
- **CL-8** — `dev:down` après arrêt déjà fait : succès idempotent et aucune suppression de volume.

## 8. Instructions d'implémentation

1. Écrire `supabase/config.toml`, la migration d'extensions et le Compose local ; valider leur syntaxe et démarrer chaque service manuellement. Commit `build(SPEC-008): configure Supabase Inngest et Mailpit locaux`.
2. Créer les scripts `dev:*` et `db:*` avec garde de base locale, contrôles de santé et sorties structurées ; ajouter les scripts pnpm. Commit `feat(SPEC-008): ajoute les commandes de pile locale`.
3. Compléter README et `.env.example` si une variable locale manque, sans valeur sensible. Commit `docs(SPEC-008): documente le démarrage local`.
4. Écrire les tests de garde et le test d'intégration qui démarre la pile, vérifie les extensions, exécute le job SPEC-007 et remet à zéro une base de test. Commit `test(SPEC-008): vérifie la pile Docker`.
5. Ajouter la démonstration SDD et son test visuel, puis exécuter la validation et renseigner les preuves réellement obtenues.

## 9. Fichiers et composants concernés

- **Créés** : `supabase/config.toml`, `supabase/migrations/0000_extensions.sql`, `docker/compose.dev.yml`, `tools/dev/up.mjs`, `tools/dev/down.mjs`, `tools/dev/check.mjs`, `tools/dev/db-reset.mjs`, `tools/dev/db-seed-demo.mjs`, `tools/dev/test/unit/guards.test.ts`, `tools/dev/test/integration/stack.test.ts`, `apps/web/components/sdd-demos/spec-008.tsx`, `apps/web/e2e/specs/p0/spec-008.spec.ts`.
- **Modifiés** : `package.json`, `README.md`, `.env.example` si nécessaire, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : route de santé SPEC-006, job de démonstration SPEC-007, `@learny/testing`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-008` affiche `h1` « Environnement local », un tableau de cinq services et leur état réel, quatre extensions SQL avec coche ou erreur, puis les commandes de démarrage, arrêt et contrôle en texte copiable. `data-testid` : `spec-008-services`, `spec-008-extensions`, `spec-008-commands`. La page n'offre pas de bouton qui démarre Docker depuis le navigateur ; elle lit le dernier contrôle effectué par le serveur en environnement SDD. Si Docker est absent, afficher « Pile locale indisponible » sans simuler des indicateurs verts.

Tester l'ordre des régions, les jetons, axe et la capture de non-régression à 1440×900 et 390×844 (`maxDiffPixelRatio: 0.01`). La capture déterministe utilise un état de santé simulé étiqueté « Démonstration », distinct des preuves du test réel de la pile.

## 11. Critères d'acceptation

- **CA-1** — `dev:up`, `dev:check`, `dev:down` démarrent, identifient et arrêtent Supabase, Inngest et Mailpit sans supprimer les volumes ; une seconde exécution est idempotente.
- **CA-2** — La base locale possède les quatre extensions requises et `db:reset` applique les migrations ; une URL de base distante est refusée avant toute mutation.
- **CA-3** — Le job SPEC-007 est visible dans Inngest Dev Server et un message factice est reçu par Mailpit ; aucun transport externe n'est utilisé.
- **CA-4** — Les défauts de Docker, de port ou d'extension rendent un code non nul et une cause identifiable.
- **CA-5** — La page SDD montre états et commandes, passe axe et les captures visuelles desktop/mobile, avec vidéo Playwright.

## 12. Plan de tests

- **Unitaires** — `tools/dev/test/unit/guards.test.ts`, `describe('[SPEC-008] local stack guards')` : URL locale/distante, APP_ENV, ports, code de sortie et idempotence des commandes (CA-2, CA-4).
- **Intégration** — `tools/dev/test/integration/stack.test.ts`, `describe('[SPEC-008] Docker stack')` : démarrer/contrôler/arrêter ; requête `pg_extension`, livraison du job SPEC-007, SMTP Mailpit, remise à zéro de la base de test ; vérifier les volumes et l'absence de Resend (CA-1, CA-2, CA-3). Le test n'est vert que si Docker a réellement tourné.
- **End-to-end** — `apps/web/e2e/specs/p0/spec-008.spec.ts`, `test('consulte la pile locale @SPEC-008')` : lire les cinq services et quatre extensions sur la page SDD, conserver la vidéo (CA-5).
- **Visuel** — `test('pile locale conforme @SPEC-008 @visual')` : `expectTokens`, structure, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-006]`, `[SPEC-007]`, `@SPEC-006`, `@SPEC-007`.

| Critère | Tests |
|---|---|
| CA-1 | intégration stack |
| CA-2 | unitaires guards ; intégration stack |
| CA-3 | intégration stack |
| CA-4 | unitaires guards ; intégration stack |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-008/` contient rapports, sortie réelle de `dev:check`, résultat SQL des extensions, preuve de réception Mailpit et du job Inngest, vidéo/captures de la démonstration, `checks.json`, `acceptance.md`. Les identifiants de connexion et messages de test sont masqués dans les rapports.

## 14. Définition de terminé

Toutes les exigences de `docs/engineering/testing.md` §7 passent. La pile a réellement démarré pendant le test d'intégration ; les commandes d'arrêt n'ont supprimé aucune donnée ; la remise à zéro refuse une URL distante. Si Docker est réellement inaccessible, la spécification est bloquée selon `sdd-process.md` et non marquée terminée.

## 15. Décisions et hypothèses

ADR-0006 fixe Supabase et ses extensions, ADR-0053 le rôle de Docker, ADR-0054 Mailpit en local. SPEC-115 créera la seed de démonstration ; avant elle, la commande correspondante signale explicitement son indisponibilité. Le déploiement auto-hébergé est couvert par SPEC-012.
