---
id: SPEC-211
title: Export des données et suppression du compte
phase: P2
priority: V1
depends_on: [SPEC-203, SPEC-112, SPEC-206, SPEC-204, SPEC-209]
business_rules: [BR-ACC-10, BR-ACC-11, BR-PLA-05]
screens: []
adrs: [ADR-0044]
visual: demo
---

# SPEC-211 — Export des données et suppression du compte

## 1. Objectif

Livrer les services en libre-service exigés par le RGPD : un export ZIP complet des données de l'utilisateur, prêt en moins de 15 minutes et téléchargeable pendant 7 jours, et une suppression du compte effective 30 jours après la demande, annulable jusque-là, puis exécutée de façon complète et vérifiable par le cron nocturne.

## 2. Contexte

L'interface (boutons « Exporter mes données » et « Supprimer mon compte » de Paramètres › Profil) est livrée par SPEC-707, qui délègue entièrement à ce service. Lire `docs/product/business-rules.md` BR-ACC-10, BR-ACC-11, BR-PLA-05, `docs/architecture/data-model.md` §1 (`profiles.deletion_requested_at`, `deletion_scheduled_for`) et §11 (`data_exports`), `docs/architecture/api.md` §2 (routes « Données personnelles »), ADR-0044 (export et suppression), ADR-0216 (arborescence du ZIP, limites de demandes, ordre d'effacement, formations partagées), ADR-0058 (buckets privés, URL signées de 10 minutes), ADR-0122 (boîte d'envoi transactionnelle), ADR-0124 et ADR-0032 (e-mails transactionnels), ADR-0121 (redirection d'un compte en suppression programmée), ADR-0035 (formations à plusieurs).

## 3. Dépendances

- **SPEC-203** : événements de domaine via `enqueue_event`, fonctions Inngest durables (`step.run`, reprise), cron `cron/nightly` (identifiant `nightly:<runDate>`), `JOBS_MODE=inline` en test.
- **SPEC-112** : table `data_exports` (`status job_status`, `storage_path`, `expires_at`, `size_bytes`), RLS propriétaire.
- **SPEC-206** : lecture des apports originaux (`resources.storage_path`), helpers d'URL signées et suppression idempotente des blobs.
- **SPEC-209** : `notify` pour la notification in-app `export_ready` (type de BR-NOT-02), créée dans la même transaction que le passage de l'export à `ready`.
- **SPEC-204** : `sendEmail` et gabarits transactionnels `export_ready` (`downloadUrl`, `sizeLabel`, `expiresLabel`), `deletion_scheduled` (`scheduledLabel`), `deletion_completed` (`requestedLabel`, avec `toOverride`).
- **SPEC-114** (transitive) : bucket privé `exports`, chemin `<userId>/<uuid>/<nom>`.
- **SPEC-202** (transitive) : `resolvePostAuthDestination` redirige un compte en suppression programmée vers `/parametres#profil`.
- **Bibliothèque** : `archiver` ≥ 7 (ZIP en flux, sans tout charger en mémoire). **Externe** : Supabase Auth Admin (`auth.admin.deleteUser`) avec la clé de service, disponible en local par Supabase CLI.

## 4. Règles métier couvertes

- **BR-ACC-10** : `POST /me/export` lance un job qui produit l'archive (cours en Markdown, apports originaux, résultats et réglages en JSON), la dépose dans `exports`, fixe `expires_at = fin + 7 jours` et envoie l'e-mail `export_ready` ; un job dépassant 15 minutes passe `failed`.
- **BR-ACC-11** : `POST /me/deletion` fixe l'échéance à J+30 et envoie `deletion_scheduled` ; `DELETE /me/deletion` annule ; la reconnexion mène à `/parametres#profil` qui propose l'annulation ; à échéance le cron efface fichiers, données et compte Auth puis envoie `deletion_completed`.
- **BR-PLA-05** : export et suppression sont en libre-service, sans intervention de l'exploitant ; les e-mails liés sont transactionnels (envoyés quelles que soient les préférences) ; aucune donnée personnelle ne subsiste après J+30 hors lignes `ai_calls` anonymisées.

## 5. Exigences fonctionnelles

- **EF-1** — `POST /api/v1/me/export` (idempotent, `Idempotency-Key`) renvoie `202 { exportId, status }`. Si un export `queued` ou `running` existe, il est renvoyé tel quel (aucun nouveau job). Au-delà de 3 demandes par jour local : `422 EXPORT_LIMIT_REACHED` (« Vous avez déjà demandé 3 exports aujourd'hui. Réessayez demain. »).
- **EF-2** — `GET /api/v1/me/exports/:id` renvoie `{ id, status, sizeBytes, createdAt, expiresAt, downloadUrl }` ; `downloadUrl` (URL signée de 10 minutes, régénérée à chaque appel) n'est présent que si `status = done` et `expiresAt` futur. Avec `?download=1`, la route répond `302` vers une URL signée neuve ; c'est ce lien applicatif (authentifié) qui figure dans l'e-mail, valable 7 jours.
- **EF-3** — Arborescence du ZIP (ADR-0216) : `README.txt` (contenu, date, fuseau) ; `settings.json` (profil, rythme, notifications, automatismes ; sans clé d'IA ni secret) ; `results.json` (tentatives, réponses, maîtrise, lacunes, série, activité quotidienne) ; `conversations.json` ; `formations/<slug>/programme.json` ; `formations/<slug>/<NN>-<slug-module>/cours.md` ; `apports/<slug>/<NN>-<slug-module>/<nom-original>`. Noms normalisés (pas de `..`, `/`, `\` ni caractère de contrôle), collisions suffixées `-2`, `-3`.
- **EF-4** — À la fin du job : `data_exports.status = done`, `size_bytes`, `storage_path`, `expires_at` ; e-mail `export_ready` avec taille (« 12,4 Mo ») et expiration (« mercredi 18 novembre à 13:20 », fuseau de l'utilisateur). En échec : `status = failed`, `error` renseigné, aucun e-mail, une nouvelle demande est possible.
- **EF-5** — `POST /api/v1/me/deletion` renvoie `200 { scheduledFor }` avec `deletion_requested_at = now` et `deletion_scheduled_for = now + 30 jours` ; un second appel renvoie la même échéance sans renvoyer d'e-mail. L'e-mail `deletion_scheduled` donne la date locale. La session reste valide.
- **EF-6** — `DELETE /api/v1/me/deletion` remet les deux colonnes à `null` et renvoie `204` ; sans demande en cours, `204` aussi (idempotent).
- **EF-7** — Le traitement nocturne `account-deletion` sélectionne les profils dont `deletion_scheduled_for ≤ now` et, pour chacun, exécute dans l'ordre d'ADR-0216 : capture de l'adresse ; retrait des groupes (formation partagée dont il est propriétaire transmise au membre le plus ancien, sinon supprimée) ; suppression des objets `resources` et `exports` ; suppression des lignes métier ; anonymisation `ai_calls.user_id = null` ; `auth.admin.deleteUser` (cascade sur `profiles`) ; e-mail `deletion_completed` à l'adresse capturée.
- **EF-8** — Le même traitement nocturne `exports-purge` supprime les objets et lignes `data_exports` expirés depuis plus de 24 h.
- **EF-9** — La page `/_dev/sdd/SPEC-211` lance un export du jeu de démonstration, affiche l'état, l'arborescence du ZIP produit et la taille, programme puis annule une suppression, et exécute une suppression complète sur un compte jetable en montrant le décompte des lignes restantes (zéro attendu).

## 6. Exigences techniques

- **ET-1** — Contrats Zod dans `packages/contracts/src/personal-data.ts` ; routes fines dans `apps/web/app/api/v1/me/{export,exports/[id],deletion}/route.ts` appelant `packages/services/src/personal-data/`.
- **ET-2** — Job `data-export` (`packages/jobs/src/functions/data-export.ts`), déclenché par l'événement `user/export-requested` émis via la boîte d'envoi dans la transaction de création ; étapes `collect`, `zip`, `upload`, `finalize`, `notify` ; `timeouts.finish: '15m'` ; idempotence `exportId`. Le ZIP est produit en flux vers Storage (mémoire bornée < 256 Mo pour 2 Go d'apports).
- **ET-3** — Les lectures de l'export utilisent `userDb` avec le JWT de l'utilisateur simulé par `serviceDb.asUser(userId)` lorsque c'est possible, afin que RLS garantisse qu'aucune ligne d'autrui (y compris dans une formation partagée) n'entre dans l'archive ; les sections de cours d'une formation partagée sont incluses, les apports des autres membres jamais.
- **ET-4** — Le job `account-deletion` (`trigger: { event: 'cron/nightly' }`) traite chaque compte dans un `step.run` par étape, identifiant `deletion:<userId>:<étape>` ; chaque étape est idempotente et reprise après échec ; un compte dont la demande a été annulée entre la sélection et l'exécution est ignoré (re-lecture sous verrou `select … for update`).
- **ET-5** — Migration additive : `data_exports.error text`, `data_exports.requested_on date` (jour local, pour la limite de 3), `ai_calls.user_id` nullable avec `on delete set null`. Toutes les autres FK vers `profiles` sont `on delete cascade` ; un test d'intégration parcourt `information_schema` et échoue si une table publique conserve une colonne `user_id` non nulle après suppression.
- **ET-6** — Les e-mails passent par `sendEmail` (catégorie `transactional`, préférences ignorées) avec `idempotencyKey` `export:<exportId>`, `deletion-scheduled:<userId>:<scheduledFor>`, `deletion-completed:<userId>`. Ils ne passent pas par `notify` (SPEC-209), mais une notification in-app `export_ready` est créée par `notify` pour l'export.
- **ET-7** — Aucune URL signée, contenu d'archive ni adresse e-mail n'est journalisé ; les journaux portent `exportId`, `userId` haché et les tailles.
- **ET-8** — Nouveau code d'erreur `EXPORT_LIMIT_REACHED` (422) dans `packages/core/src/errors.ts` ; routes ajoutées à `docs/architecture/api.md` si absentes (déjà inventoriées).

## 7. Comportements attendus et cas limites

- **CL-1** — Double clic sur « Exporter » : même `exportId`, un seul job, un seul e-mail.
- **CL-2** — Export demandé pendant une suppression programmée : autorisé (l'utilisateur peut récupérer ses données avant l'échéance).
- **CL-3** — Apport supprimé (`deleted_at`) : absent de `apports/` ; ses citations restent dans `cours.md` avec « source supprimée ».
- **CL-4** — Lien de l'e-mail ouvert après 7 jours : la route répond `410` `EXPORT_EXPIRED` (« Cet export a expiré. Demandez-en un nouveau depuis Paramètres. »).
- **CL-5** — Lien d'export ouvert par un autre utilisateur connecté : `404`, sans révéler l'existence de l'export.
- **CL-6** — Job interrompu (crash) à l'étape `upload` : reprise Inngest, objet partiel écrasé, un seul ZIP final.
- **CL-7** — Annulation de la suppression à J+29 23:59 locale : la demande disparaît, le cron de la nuit ne supprime rien.
- **CL-8** — Échec de `auth.admin.deleteUser` : les étapes précédentes restent faites, l'étape est retentée la nuit suivante, aucun e-mail `deletion_completed` tant qu'elle n'a pas réussi ; l'utilisateur ne peut plus se connecter dès que ses données sont supprimées (profil absent → déconnexion).
- **CL-9** — Propriétaire d'une formation partagée avec deux membres : la formation est transmise au membre le plus ancien ; les apports privés du propriétaire sont supprimés, ceux des membres conservés.
- **CL-10** — Nom d'apport `../../etc/passwd` : normalisé en `etc-passwd` à l'intérieur de `apports/`.

## 8. Instructions d'implémentation

1. Migration additive (ET-5), contrats, code d'erreur. Commit `feat(SPEC-211): prépare export et suppression`.
2. Routes et service d'export (création idempotente, limite quotidienne, lecture, lien de téléchargement). Commit `feat(SPEC-211): demande et téléchargement d'export`.
3. Job `data-export` (collecte sous RLS, ZIP en flux, normalisation des noms, finalisation, e-mail, notification). Commit `feat(SPEC-211): génère l'archive ZIP`.
4. Routes de demande et d'annulation de suppression, e-mail programmé. Commit `feat(SPEC-211): programme et annule la suppression`.
5. Jobs nocturnes `account-deletion` et `exports-purge`. Commit `feat(SPEC-211): exécute les suppressions échues`.
6. Page SDD, tests d'intégration (horloge avancée de 30 jours), e2e et visuel. Commit `test(SPEC-211): démontre export et suppression`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/personal-data.ts`, `packages/services/src/personal-data/{export,deletion,zip-layout,index}.ts`, `packages/services/src/personal-data/zip-layout.test.ts`, `packages/services/test/integration/personal-data.test.ts`, `packages/jobs/src/functions/{data-export,account-deletion,exports-purge}.ts`, `apps/web/app/api/v1/me/export/route.ts`, `apps/web/app/api/v1/me/exports/[id]/route.ts`, `apps/web/app/api/v1/me/deletion/route.ts`, migration `packages/db/migrations/<horodatage>_personal_data_lifecycle.sql`, `apps/web/components/sdd-demos/spec-211.tsx`, `apps/web/e2e/specs/p2/spec-211.spec.ts`.
- **Modifiés** : `packages/core/src/errors.ts`, `packages/jobs/src/{events,registry}.ts`, `packages/contracts/src/index.ts`, `packages/db/src/schema/{exports,ai}.ts`, registre SDD, `apps/web/messages/fr.ts`, `docs/architecture/data-model.md` §11 (colonnes ajoutées).
- **Lus / réutilisés** : `sendEmail` (SPEC-204), `notify` (SPEC-209) pour la notification in-app `export_ready`, helpers Storage (SPEC-114/206), `cron/nightly` (SPEC-203), `startOfUserDay`, `formatUserDate` (SPEC-207).

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-211`, `h1` « SPEC-211 — Export des données et suppression du compte ». Régions :
1. « Export » (`spec-211-export`) : bouton « Lancer un export », badge d'état (« En file », « En cours », « Prêt », « Échec », « Expiré »), taille, date d'expiration, bouton « Télécharger », et arborescence du ZIP en liste imbriquée (`spec-211-tree`).
2. « Suppression » (`spec-211-deletion`) : boutons « Programmer la suppression » et « Annuler la suppression », date d'échéance locale, et aperçu des e-mails envoyés (transport mémoire).
3. « Exécution à J+30 » (`spec-211-execution`) : bouton « Avancer l'horloge de 30 jours et exécuter » sur un compte jetable, puis tableau « table → lignes restantes » (toutes à 0) et statut du compte Auth (« supprimé »).
Résultats annoncés dans `role="status"` ; clavier et 390 px ; jetons SPEC-301. Contrôles : jetons, ordre des régions, axe sans violation, captures desktop 1440 et mobile 390, écart ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — L'export du jeu de démonstration produit un ZIP conforme à l'arborescence d'ADR-0216, sans donnée d'un autre utilisateur ni secret, terminé en moins de 15 minutes, et l'e-mail `export_ready` est envoyé une fois.
- **CA-2** — Le téléchargement n'est possible que par le propriétaire, pendant 7 jours, via des URL signées de 10 minutes ; après expiration la route répond 410 et la purge supprime l'objet.
- **CA-3** — Demande, réitération et annulation de suppression sont idempotentes ; l'e-mail `deletion_scheduled` porte la date locale de J+30.
- **CA-4** — À J+30, toutes les lignes personnelles, fichiers et le compte Auth sont supprimés, `ai_calls` est anonymisé, une formation partagée est transmise, et `deletion_completed` est envoyé à l'adresse capturée.
- **CA-5** — Une annulation avant l'échéance ou une reprise après échec d'étape ne produit ni suppression indue ni double e-mail.
- **CA-6** — La page SDD démontre export, suppression et exécution ; vidéo, axe et captures desktop/mobile ≤ 1 %.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/personal-data/zip-layout.test.ts`, `describe('[SPEC-211] arborescence de l'export')` : slugs, numérotation des modules, collisions `-2`, noms hostiles, exclusion des secrets de `settings.json` (CA-1).
- **Intégration** — `packages/services/test/integration/personal-data.test.ts`, `describe('[SPEC-211] export et suppression')` : deux utilisateurs dont une formation partagée ; export complet (contenu du ZIP, durée, e-mail unique), double demande, limite de 3, lien après 7 jours → 410, accès d'autrui → 404, purge (CA-1, CA-2) ; demande/annulation idempotentes (CA-3) ; horloge avancée de 30 jours, exécution, parcours `information_schema` sans ligne restante, transmission de la formation, `ai_calls` anonymisé, e-mail final (CA-4) ; annulation à J+29 23:59 et échec simulé de `deleteUser` puis reprise (CA-5).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-211.spec.ts`, `test('export puis suppression complète @SPEC-211')` : lancer l'export, attendre « Prêt », télécharger, vérifier l'arborescence ; programmer puis annuler ; exécuter J+30 sur le compte jetable, vérifier les zéros ; vidéo (CA-6).
- **Visuel** — `test('données personnelles conformes @SPEC-211 @visual')` : régions, jetons, axe, captures ≤ 1 % (CA-6).
- **Non-régression** — `[SPEC-112]`, `[SPEC-203]` / `@SPEC-203`, `[SPEC-204]` / `@SPEC-204`, `[SPEC-206]` / `@SPEC-206`, `[SPEC-202]` (redirection d'un compte en suppression).

| Critère | Tests |
|---|---|
| CA-1 | unitaires arborescence ; intégration export |
| CA-2 | intégration accès, expiration, purge |
| CA-3 | intégration demande/annulation |
| CA-4 | intégration exécution J+30 |
| CA-5 | intégration annulation tardive et reprise |
| CA-6 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-211/` : rapports Vitest et Playwright, listing de l'archive du jeu de démonstration (`zip-tree.txt`, sans contenu), durée et taille de l'export, outbox des trois e-mails (destinataires factices), tableau des lignes restantes après J+30, journal de reprise après échec, vidéo, captures desktop/mobile, `checks.json`, `acceptance.md`. Aucune archive réelle ni URL signée n'est commitée.

## 14. Définition de terminé

Validations communes de `docs/engineering/testing.md` §7. En plus : le contrôle `information_schema` de ET-5 fait partie de la suite d'intégration et reste vert, CP-2 peut démontrer « Export ZIP et cycle de suppression J+30 vérifiés avec horloge figée », et SPEC-707 n'a besoin d'aucune autre route.

## 15. Décisions et hypothèses

- ADR-0044 : ZIP dans `exports`, lien de 7 jours, suppression à J+30, connexion possible pour annuler, cron nocturne.
- ADR-0216 (créé pour cette spécification) : arborescence du ZIP, un export en cours et 3 demandes par jour, échec au-delà de 15 minutes, ordre d'effacement, transmission des formations partagées, anonymisation d'`ai_calls`.
- ADR-0058 fixe des URL signées de 10 minutes : le « lien valable 7 jours » de BR-ACC-10 est donc le lien applicatif authentifié `GET /me/exports/:id?download=1`, qui émet une URL signée neuve à chaque clic tant que `expires_at` n'est pas dépassé.
- ADR-0122 (boîte d'envoi), ADR-0124 et ADR-0032 (e-mails transactionnels hors préférences, plafond et heures calmes), ADR-0121 (redirection vers `/parametres#profil`).
- Hypothèse : les journaux Sentry et Inngest conservés par les fournisseurs relèvent de leur propre rétention, documentée dans le registre des traitements de SPEC-806.
