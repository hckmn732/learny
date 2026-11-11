---
id: SPEC-114
title: Stockage des fichiers
phase: P1
priority: V1
depends_on: [SPEC-104, SPEC-113]
business_rules: []
screens: []
adrs: [ADR-0058]
visual: demo
---

# SPEC-114 — Stockage des fichiers

## 1. Objectif

Créer deux buckets Supabase privés pour les apports et exports, avec politiques Storage par propriétaire et helpers d'URL signées de dix minutes. Un utilisateur doit pouvoir lire ou envoyer ses fichiers autorisés sans obtenir l'objet d'un autre, y compris dans une formation à plusieurs.

## 2. Contexte

ADR-0058 fixe les buckets `resources` et `exports`, le chemin `<userId>/<uuid>/<nom>` et les URL signées de dix minutes. `docs/architecture/data-model.md` §3 et §11 contient les métadonnées en base ; SPEC-104 crée `resources.storage_path` et SPEC-112 `data_exports.storage_path`. Lire `docs/engineering/conventions.md` §7–§9, `docs/product/business-rules.md` BR-APP-02/03/10 et BR-ACC-10, SPEC-113 pour RLS et `docs/architecture/api.md` §2. SPEC-206 réalisera la validation MIME, taille et quota avant finalisation.

## 3. Dépendances

- **SPEC-104** : table `resources` avec propriétaire et chemin de stockage.
- **SPEC-113** : politiques RLS des tables DB et harnais d'isolation à deux utilisateurs ; les politiques Storage doivent fournir une protection équivalente.
- **SPEC-101/008** : Supabase local, Storage, migrations et tests d'intégration.
- Aucun stockage public ni fournisseur cloud supplémentaire n'est admis.

## 4. Règles métier couvertes

Aucune règle `BR-*` attribuée directement. La spécification prépare BR-APP-03 (apports privés) et BR-ACC-10 (export privé) ; les contraintes de taille BR-APP-02 et la suppression BR-APP-10 sont mises en œuvre par SPEC-206/607.

## 5. Exigences fonctionnelles

- **EF-1** — Le bucket `resources` et le bucket `exports` existent, sont privés et refusent la lecture anonyme. Aucun objet n'a de lien public permanent.
- **EF-2** — Chaque objet est stocké sous `<userId>/<uuid>/<nom>` où `userId` est l'UUID de l'utilisateur authentifié, le deuxième segment un UUID de ressource/export et `nom` un nom nettoyé sans séparateur, chemin relatif ou caractère de contrôle. Le nom original reste en métadonnée privée si nécessaire.
- **EF-3** — Un utilisateur peut obtenir une URL d'envoi signée valable dix minutes pour un chemin dont le premier segment est son ID ; une URL de lecture signée de dix minutes est délivrée seulement après vérification de propriété de la ligne DB liée. Une URL expirée est refusée.
- **EF-4** — La création de signature pour `exports` est réservée au job d'export et la lecture à son propriétaire ; un autre utilisateur ou un membre de groupe ne reçoit jamais la signature d'un export d'autrui.
- **EF-5** — La suppression d'un apport/export retire l'objet du bucket approprié ; elle est idempotente si l'objet a déjà été retiré et ne peut pas supprimer un autre chemin par manipulation d'ID.
- **EF-6** — Un inventaire des objets d'un utilisateur ne retourne que les chemins sous son préfixe. Le service de stockage ne révèle pas si un chemin d'autrui existe.
- **EF-7** — La page SDD illustre deux buckets privés, un chemin de démonstration et la durée de signature sans rendre une URL signée réelle dans le HTML.

## 6. Exigences techniques

- **ET-1** — Migration SQL versionnée créant `storage.buckets` avec `public=false`, types/limites par bucket quand Supabase les supporte ; politiques `storage.objects` sur `bucket_id` et premier segment du nom égal à `auth.uid()::text`.
- **ET-2** — Les politiques couvrent `SELECT`, `INSERT`, `UPDATE` et `DELETE` ; `WITH CHECK` interdit de déplacer un objet sous le préfixe d'autrui. Aucun `USING(true)` pour un rôle authentifié général.
- **ET-3** — `packages/db/src/storage/paths.ts` expose `resourcePath(userId, resourceId, originalName)`, `exportPath(...)` et `parseOwnedPath(path,userId)`. La normalisation du nom empêche `..`, barre oblique, antislash, NUL et encodage de séparateur.
- **ET-4** — `packages/db/src/storage/signed-urls.ts` retourne `{url, expiresAt}` ; l'instant d'expiration est calculé par l'horloge injectable, TTL exactement dix minutes. Le service vérifie la ligne DB avant signature, utilise le client utilisateur ou un rôle service limité selon l'opération.
- **ET-5** — Les URL signées ne sont jamais journalisées ; les tests vérifient seulement leur validité/expiration sur un bucket local et masquent le jeton dans les rapports.
- **ET-6** — La migration est rangée dans `supabase/migrations` et son pendant dans `packages/db/migrations` conformément à SPEC-101 ; les tests Storage utilisent des comptes JWT A et B réels en Supabase local.

## 7. Comportements attendus et cas limites

- **CL-1** — Chemin contenant `../`, `..\`, séparateur encodé ou nom vide : refus avant signature.
- **CL-2** — Compte B connaît le chemin A : liste/lecture/écriture/suppression refusées, sans différence révélant l'existence du fichier.
- **CL-3** — A et B appartiennent au même groupe : les apports restent privés.
- **CL-4** — URL de lecture après dix minutes : rejet par Storage ; une nouvelle URL nécessite une nouvelle vérification d'accès.
- **CL-5** — Objet DB supprimé mais blob présent : aucune nouvelle URL de lecture ; job de nettoyage peut supprimer le blob.
- **CL-6** — Blob absent à la suppression : succès idempotent seulement pour le propriétaire.
- **CL-7** — Changement de nom d'apport : le chemin conservé reste valide jusqu'au déplacement contrôlé du fichier ; aucune nouvelle signature vers un préfixe différent.
- **CL-8** — Bucket configuré public par erreur : test d'intégration en échec.

## 8. Instructions d'implémentation

1. Écrire la migration des buckets privés et politiques Storage, puis vérifier `public=false` et les rôles Supabase locaux. Commit `feat(SPEC-114): crée les buckets privés`.
2. Écrire les helpers de chemin et signatures de dix minutes, avec vérification DB avant lecture. Commit `feat(SPEC-114): signe les accès aux fichiers`.
3. Tester A/B sur toutes les opérations et l'expiration, y compris membres du même groupe. Commit `test(SPEC-114): prouve l'isolation Storage`.
4. Ajouter page SDD, test navigateur/visuel, valider la spécification et renseigner les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/storage/paths.ts`, `packages/db/src/storage/paths.test.ts`, `packages/db/src/storage/signed-urls.ts`, `packages/db/migrations/NNNN_storage.sql` et copie Supabase, `packages/db/test/integration/storage.test.ts`, `apps/web/components/sdd-demos/spec-114.tsx`, `apps/web/e2e/specs/p1/spec-114.spec.ts`.
- **Modifiés** : `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `resources`, `data_exports`, clients Supabase de SPEC-101 et matrice SPEC-113.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-114` affiche « Stockage privé », deux cartes de bucket avec pastille « Privé », un exemple de chemin dont l'UUID est factice, puis « URL signée : 10 min ». Une matrice « Propriétaire / Autre membre / Anonyme » montre les accès attendus en texte. `data-testid` : `spec-114-buckets`, `spec-114-path`, `spec-114-ttl`, `spec-114-access`. Aucune URL signée réelle ni nom d'apport privé n'est affiché. Tester jetons, ordre, axe et captures desktop/mobile à 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les deux buckets sont privés et une lecture anonyme échoue.
- **CA-2** — Un propriétaire obtient des URL d'envoi/lecture de dix minutes ; un chemin invalide est refusé.
- **CA-3** — Le compte B, même membre du groupe, ne liste, lit, écrit ni supprime les objets A.
- **CA-4** — Une URL expirée est rejetée, et une ligne DB supprimée ne permet plus de signer une lecture.
- **CA-5** — La page SDD affiche buckets, chemin, TTL et matrice, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/storage/paths.test.ts`, `describe('[SPEC-114] storage paths')` : préfixe, nom nettoyé, traversal/encodage, TTL calculé (CA-2).
- **Intégration** — `packages/db/test/integration/storage.test.ts`, `describe('[SPEC-114] Storage isolation')` : buckets privés, URL signées, A/B/anonyme et groupe, expiration avec horloge injectée et objet orphelin (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-114.spec.ts`, `test('inspecte le stockage privé @SPEC-114')` : ouvrir la démonstration, vérifier deux buckets et matrice, garder la vidéo (CA-5).
- **Visuel** — `test('stockage conforme @SPEC-114 @visual')` : structure, jetons, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-104]` et `[SPEC-113]`.

| Critère | Tests |
|---|---|
| CA-1 | intégration buckets |
| CA-2 | unitaires ; intégration signatures |
| CA-3 | intégration A/B/groupe |
| CA-4 | intégration expiration/orphelin |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-114/` contient état réel des buckets, matrice d'accès, test d'expiration, rapports, vidéo/captures, `checks.json` et `acceptance.md`. Les jetons d'URL et noms de fichiers privés sont expurgés.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 passent ; les deux buckets sont privés, les politiques Storage rejettent A/B croisés, la signature expire réellement et aucun lien public permanent n'existe.

## 15. Décisions et hypothèses

ADR-0058 fixe buckets, chemin et TTL de dix minutes. SPEC-206 applique les limites MIME/taille/quota avant finalisation ; cette spécification fixe l'isolation et la mécanique de stockage.
