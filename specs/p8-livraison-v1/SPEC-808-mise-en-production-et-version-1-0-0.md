---
id: SPEC-808
title: Mise en production et version 1.0.0
phase: P8
priority: V1
depends_on: [SPEC-807, SPEC-013]
business_rules: [BR-PLA-04]
screens: []
adrs: [ADR-0051, ADR-0073]
visual: demo
---

# SPEC-808 — Mise en production et version 1.0.0

## 1. Objectif

Préparer une mise en production vérifiable de la V1 : contrôler les régions UE, la configuration, les domaines, l'e-mail, Stripe, les tarifs IA, Sentry et les migrations ; documenter les blocages externes ; exécuter le déploiement seulement lorsque ses prérequis sont disponibles. Le tag `v1.0.0` est créé par CP-8 après la validation de la phase, jamais anticipé.

## 2. Contexte

Lire `docs/engineering/sdd-process.md` §1–§3, `docs/engineering/git.md` §1–§5, `docs/architecture/overview.md` §2 et §6, `docs/product/business-rules.md` BR-PLA-04, `specs/checkpoints.md` CP-8, ADR-0006, ADR-0017, ADR-0045, ADR-0051, ADR-0073, ainsi que les preuves SPEC-013 et SPEC-807. SPEC-013 fournit la procédure de déploiement géré ; SPEC-807 prouve les parcours locaux complets. Les valeurs de production (domaine, identité légale, comptes fournisseurs, DNS, clés) appartiennent au porteur et ne doivent pas être inventées.

## 3. Dépendances

- **SPEC-807** : suite V1 complète, cross-browser, visuel, sécurité, accessibilité, performances et rapports de non-régression.
- **SPEC-013** : workflow de déploiement, migrations distantes et environnement Vercel/Supabase/Inngest.
- **Services externes** : projet Supabase UE, Vercel en région `fra1`, Inngest UE, domaine/DNS, Resend, Stripe live, Sentry et clés IA/embeddings selon l'offre activée. Leur indisponibilité est enregistrée avec `fail.mjs --external` après la configuration et les tests mock réalisables.
- **Identité légale** : variables de SPEC-806 remplies avant publication publique ; le marqueur « [à compléter] » bloque la publication.

## 4. Règles métier couvertes

- **BR-PLA-04** : les données, fichiers et fonctions hébergés par les services gérés sont configurés dans l'UE. La checklist enregistre la région observée de chaque service ; une région inconnue ou hors UE bloque le déploiement.

## 5. Exigences fonctionnelles

- **EF-1** — `docs/operations/release-v1.md` porte une checklist à états `non vérifié`, `réussi`, `échec`, `bloqué externe`, avec date, environnement, personne/commande de vérification et lien vers la preuve pour chaque item. Aucun item n'est coché par défaut. Les items couvrent toutes les conditions du contexte et CP-8.
- **EF-2** — La configuration de production est vérifiée par une commande `pnpm release:preflight` qui lit uniquement noms et présence des variables, régions et versions attendues ; elle ne les imprime pas. Sont vérifiés : domaine public et HTTPS, Supabase région UE, Inngest UE, Vercel `fra1`, `APP_ENV=production`, pages SDD désactivées, base, Auth, Storage, e-mail, Stripe, Sentry, clé de chiffrement, versions légales et prix IA.
- **EF-3** — Les tarifs de `packages/config/src/pricing.ts` sont comparés aux tarifs officiels en vigueur avant publication, par une vérification humaine ou une source externe archivée avec date et lien ; une valeur non vérifiée est `bloqué externe`, jamais déclarée actuelle sur la base de l'ADR historique. Les coûts simulés des tests utilisent ensuite la configuration figée.
- **EF-4** — Les migrations distantes sont appliquées dans l'ordre sur un environnement preview avec sauvegarde/restauration testée, puis en production après contrôle d'empreinte et absence de migration destructive non documentée. Les secrets restent dans le gestionnaire de déploiement, jamais dans le dépôt ou le rapport.
- **EF-5** — Après déploiement, `pnpm release:smoke` appelle la santé publique, charge les pages légales, vérifie l'inscription/connexion avec une boîte de test, le chargement d'un écran connecté, un job Inngest de test et un envoi d'e-mail de test ; il produit des résultats par étape, sans créer de données persistantes non nettoyées.
- **EF-6** — Un `CHANGELOG.md` version 1.0.0 résume les fonctionnalités V1 et les changements depuis le dernier checkpoint à partir des commits/specs terminées. Il ne prétend pas annoncer une fonctionnalité dont le statut n'est pas `done`.
- **EF-7** — Si un prérequis externe manque, l'agent termine scripts, configuration, dry-run et tests mock, consigne le blocage exact dans `progress/blockers.md` via la boucle SDD et poursuit les tâches indépendantes. Il ne publie pas, ne modifie pas les remotes et ne crée pas de tag. Quand les prérequis sont présents, la commande de déploiement utilise le workflow SPEC-013 et enregistre l'URL et les vérifications observées.
- **EF-8** — CP-8, après SPEC-808 `done`, exécute audit, lint, typecheck, build, couverture, intégration, e2e cross-browser et critères de `specs/checkpoints.md` ; seulement alors il crée `cp-8` et `v1.0.0` sur `main` selon ADR-0051.

## 6. Exigences techniques

- **ET-1** — `tools/release/preflight.mjs` produit un JSON avec `{ check, status, detailRedacted, evidence }[]` et un code non nul si une condition bloquante échoue. Les sorties n'incluent jamais la valeur d'une variable secrète ; seuls les identifiants de région et de version non secrets peuvent apparaître.
- **ET-2** — `tools/release/smoke.mjs` accepte une URL de base HTTPS et des identifiants de test provenant de l'environnement sécurisé ; délai borné, nettoyage `finally`, code non nul au premier échec bloquant. Aucune requête de mutation n'est envoyée à une URL non autorisée par la configuration de release.
- **ET-3** — La commande de migration ne se lance qu'après `preflight` vert et confirmation automatique que le projet Supabase cible appartient à l'environnement sélectionné ; les empreintes des migrations locales et appliquées sont comparées. Une différence non expliquée bloque la commande.
- **ET-4** — Le rapport de release conserve le commit SHA, l'empreinte du lockfile et des migrations, les régions et les résultats de tests. Les fichiers de sortie sont expurgés avant ajout à `evidence/SPEC-808/`; aucun `.env` ni réponse d'Auth n'est archivé.
- **ET-5** — `tools/sdd/checkpoint.mjs CP-8` reste seul propriétaire des tags ; le script de SPEC-808 ne crée, déplace ni supprime un tag. Le push n'a lieu que si `origin` existe et selon `docs/engineering/git.md`.
- **ET-6** — Les modes `LLM_MODE=mock`, `STRIPE_MODE=mock`, `EMAIL_MODE=memory` restent ceux de la CI ; le smoke de production est explicitement séparé, contrôlé et identifie les services réellement contactés.

## 7. Comportements attendus et cas limites

- **CL-1** — Région fournisseur absente ou hors UE : preflight en échec, pas de déploiement.
- **CL-2** — Variable légale vide : page locale affiche « [à compléter] », publication bloquée selon ADR-0045.
- **CL-3** — Tarif IA non vérifié depuis la date de l'ADR : statut `bloqué externe` ; aucun prix supposé actuel.
- **CL-4** — Migration déjà appliquée avec même empreinte : idempotente ; empreinte différente : refus et diagnostic.
- **CL-5** — Smoke échoue après déploiement : état de release en échec, rollback selon procédure SPEC-013, pas de tag `v1.0.0`.
- **CL-6** — Pas de `origin` : travail local et preuves conservés, aucun remote créé ou modifié.
- **CL-7** — Service externe inaccessible : les tests mock restent verts s'ils le sont réellement, mais l'item live et la spécification ne deviennent pas `done` sans la preuve demandée.
- **CL-8** — Fichier de rapport contient un secret : contrôle de secret en échec, fichier non commité et rapport régénéré expurgé.

## 8. Instructions d'implémentation

1. Écrire la checklist et la procédure de rollback/contacts d'incident depuis les services réellement configurés, avec tous les items à `non vérifié`. Commit `docs(SPEC-808): prépare la checklist de publication V1`.
2. Ajouter `preflight.mjs`, ses schémas, tests et script pnpm ; vérifier les régions/variables/versions sans imprimer de secret. Commit `feat(SPEC-808): vérifie les prérequis de production`.
3. Ajouter `smoke.mjs`, tests sur environnement simulé et procédure de nettoyage ; préparer les étapes de migration preview/production avec dry-run. Commit `test(SPEC-808): vérifie le déploiement et ses échecs`.
4. Mettre à jour `CHANGELOG.md` à partir des statuts `done`, créer la démonstration SDD et les tests e2e/visuels. Commit `docs(SPEC-808): prépare les notes de version`.
5. Exécuter les contrôles disponibles. Si un service/identité/tarif manque, utiliser `fail.mjs --external` avec raison précise et conserver les rapports ; sinon déployer par SPEC-013, exécuter le smoke et la validation SDD. Le checkpoint CP-8 crée les tags après réussite.

## 9. Fichiers et composants concernés

- **Créés** : `docs/operations/release-v1.md`, `tools/release/preflight.mjs`, `tools/release/smoke.mjs`, `tools/release/test/unit/preflight.test.ts`, `tools/release/test/integration/smoke.test.ts`, `apps/web/components/sdd-demos/spec-808.tsx`, `apps/web/e2e/specs/p8/spec-808.spec.ts`.
- **Modifiés** : `package.json` (scripts `release:preflight`, `release:smoke`), `CHANGELOG.md`, `docs/operations/deployment.md` si la procédure change, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : workflow SPEC-013, preuves SPEC-807, `packages/config/src/pricing.ts`, variables SPEC-009/806, `tools/sdd/checkpoint.mjs`, `specs/checkpoints.md`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-808` affiche « Préparation V1 » avec commit, état du preflight, liste des catégories (Régions, Identité légale, Domaine, E-mail, Paiement, IA, Observabilité, Migrations, Tests), puis l'état du smoke et des tags. Chaque ligne affiche `non vérifié`, `réussi`, `échec` ou `bloqué externe`; une valeur secrète ne figure jamais dans le DOM. `data-testid` : `spec-808-preflight`, `spec-808-smoke`, `spec-808-release-tags`. Sans rapport, tous les contrôles sont « non vérifié ».

Vérifier ordre, jetons, axe et capture `toHaveScreenshot('spec-808-demo.png', { maxDiffPixelRatio: 0.01 })` à 1440×900 et 390×844 ; le test est exécuté avec un rapport simulé marqué comme tel. La vidéo ne constitue pas une preuve de déploiement live.

## 11. Critères d'acceptation

- **CA-1** — Preflight refuse région hors UE, pages SDD actives, identité légale manquante et variable obligatoire absente sans imprimer de secret.
- **CA-2** — La checklist couvre chaque service et critère CP-8, avec statut et lien de preuve ; un tarif IA non revérifié reste bloquant.
- **CA-3** — Les migrations preview/production sont contrôlées par empreinte et le smoke teste réellement santé, pages, compte, job et e-mail sur l'environnement autorisé.
- **CA-4** — `CHANGELOG.md` ne liste que des capacités terminées ; aucun tag n'est créé par la spécification avant la réussite de CP-8.
- **CA-5** — La page SDD rend les statuts réels ou « non vérifié », passe axe et le test visuel avec vidéo ; les blocages externes ne sont jamais représentés comme une réussite.

## 12. Plan de tests

- **Unitaires** — `tools/release/test/unit/preflight.test.ts`, `describe('[SPEC-808] preflight')` : régions, variables, redaction, tarif non vérifié, tag absent (CA-1, CA-2, CA-4).
- **Intégration** — `tools/release/test/integration/smoke.test.ts`, `describe('[SPEC-808] release smoke')` : serveur de test local HTTPS simulé, scénarios succès/échec, nettoyage, empreinte migration, liste de contrôle générée (CA-2, CA-3).
- **End-to-end** — `apps/web/e2e/specs/p8/spec-808.spec.ts`, `test('inspecte la préparation V1 @SPEC-808')` : ouvrir la page SDD, vérifier catégories et statuts du rapport de test, absence de secret, vidéo conservée (CA-5).
- **Visuel** — `test('préparation V1 conforme @SPEC-808 @visual')` : `expectTokens`, structure, axe, capture desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — suite SPEC-807, vérification CP-8, `pnpm release:preflight` sur environnement de test (CA-1–CA-4).

| Critère | Tests |
|---|---|
| CA-1 | `preflight.test.ts` |
| CA-2 | `preflight.test.ts` ; checklist validée |
| CA-3 | `smoke.test.ts` ; rapport smoke live si disponible |
| CA-4 | contrôle du changelog et tags ; CP-8 |
| CA-5 | e2e `@SPEC-808 @visual` |

## 13. Preuves attendues

`evidence/SPEC-808/` contient JSON de preflight expurgé, empreintes des migrations, rapports smoke, vérification des régions et tarifs avec date/source, checklist, `CHANGELOG.md`, rapports Vitest/Playwright, vidéo/captures, `checks.json` et `acceptance.md`. Une preuve de service live absente est marquée absente ; aucune URL ou prix n'est inventé.

## 14. Définition de terminé

La définition de `docs/engineering/testing.md` §7 passe, les critères de preflight et smoke requis sont effectivement vérifiés, et tout blocage externe est traité par la boucle SDD. SPEC-808 prépare la livraison ; CP-8, après toutes les spécifications P8 `done`, exécute ses contrôles et crée `v1.0.0`. Une checklist incomplète ou une identité absente interdit de présenter la V1 comme publiée.

## 15. Décisions et hypothèses

ADR-0051 fixe branches, fusion, remote et tags ; ADR-0073 impose la revérification des tarifs IA. ADR-0006, ADR-0017 et ADR-0045 fixent régions et identité légale. Le nom de domaine et les comptes de production ne figurent pas dans le dépôt ; ils sont des prérequis externes, jamais des valeurs déduites.
