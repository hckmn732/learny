---
id: SPEC-505
title: Clés personnelles chiffrées
phase: P5
priority: V1
depends_on: [SPEC-504]
business_rules: [BR-IA-02, BR-IA-03, BR-IA-04]
screens: []
adrs: [ADR-0019, ADR-0154, ADR-0159]
visual: demo
---

# SPEC-505 — Clés personnelles chiffrées

## 1. Objectif

Permettre à un utilisateur d'enregistrer, lister et supprimer ses identifiants de fournisseurs d'IA (« clés personnelles ») : chiffrement AES-256-GCM avec clé maîtresse et rotation documentée, masquage, indicateur hors UE par fournisseur, API `/api/v1/me/ai/credentials`, déchiffrement réservé au serveur au moment de l'appel. Aucune clé n'est jamais renvoyée au navigateur.

## 2. Contexte

- Lire : `docs/architecture/data-model.md` §9 (`ai_credentials`, `ai_task_models`), `docs/architecture/api.md` (routes `/me/ai/credentials`), `docs/architecture/ai.md` §2, ADR-0019, ADR-0042, ADR-0154, ADR-0159 ; maquette `design/maquettes/Parametres.dc.html` onglet « Modèles d'IA » (cartes fournisseurs, `sk-••••••••a91F`, formulaire d'ajout : fournisseur, nom du modèle, adresse si compatible/local, clé, notes de données).
- L'écran est livré par SPEC-709 ; la qualification (statut `qualified`) par SPEC-506 ; cette spécification fournit le stockage et l'API.

## 3. Dépendances

- **SPEC-504** : catalogue des fournisseurs (`providers/catalog.ts`), fabrique (qui appellera `decryptCredentialKey`), codes d'erreur.
- Déjà livrés : table `ai_credentials` (SPEC-110), RLS (SPEC-113), `handler()` et limitation de débit (SPEC-201, SPEC-208), `packages/config` (SPEC-009).
- Variables : `APP_ENCRYPTION_KEY` (obligatoire, 32 octets base64), `APP_ENCRYPTION_KEY_PREVIOUS` (facultative), `ALLOW_LOCAL_MODELS` (`false` par défaut). Absence de `APP_ENCRYPTION_KEY` en production → échec de démarrage (SPEC-009) ; en test, une clé fixe de test est fournie par `@learny/testing`.
- Bibliothèque : `node:crypto` uniquement.

## 4. Règles métier couvertes

- **BR-IA-02** : l'utilisateur enregistre, par fournisseur (Anthropic, OpenAI, Mistral, DeepSeek, service compatible OpenAI, modèle local), un identifiant portant sa clé et ses noms de modèles ; statut initial `untested` ; l'activation sur une tâche n'est possible qu'après qualification (SPEC-506).
- **BR-IA-03** : chiffrement AES-256-GCM au repos (ADR-0154) ; aucune réponse d'API, journal, erreur ou page ne contient la clé ; affichage `sk-••••••••` + 4 derniers caractères ; suppression à tout moment (`DELETE`).
- **BR-IA-04** : chaque identifiant porte `outside_eu` et une note de données issus du catalogue (ADR-0154) ; le DTO expose `outsideEu: true` et la note « Ce fournisseur traite les données hors de l’Union européenne. » pour OpenAI, DeepSeek et Anthropic.

## 5. Exigences fonctionnelles

- **EF-1** — `POST /api/v1/me/ai/credentials` (Idempotency-Key obligatoire, profil de limitation IA 20/min) : corps `{ provider, label?, modelIds, baseUrl?, apiKey? }` → `201` DTO (EF-4), `status: 'untested'`. `label` par défaut : « Anthropic », « OpenAI », « Mistral », « DeepSeek », « Service compatible OpenAI », « Modèle local ».
- **EF-2** — `GET /api/v1/me/ai/credentials` → `200 { items: CredentialDto[] }` triés par `createdAt` croissant (au plus 10, pas de pagination).
- **EF-3** — `DELETE /api/v1/me/ai/credentials/:id` → `204` ; dans la même transaction : suppression des lignes `ai_task_models` qui y font référence (les tâches reviennent au modèle par défaut) puis de l'identifiant (chiffré effacé avec la ligne). Identifiant d'autrui ou inexistant → `404`.
- **EF-4** — DTO :
```ts
{ id, provider, providerLabel, label, baseUrl: string | null, modelIds: string[], keyMasked: string | null,
  status: 'untested' | 'qualified' | 'failed', outsideEu: boolean, dataNote: string,
  qualifiedAt: string | null, createdAt: string }
```
Jamais de champ `apiKey`, `encryptedKey` ni rapport brut (le rapport de qualification est exposé par SPEC-506).
- **EF-5** — Validations (`422 VALIDATION_FAILED`, champs en erreur) : `provider` ∈ énumération ; `modelIds` 1..10, chacun 1..120 caractères `^[A-Za-z0-9._:/-]+$`, sans doublon ; `apiKey` 8..512 caractères sans blanc, obligatoire sauf `local` ; `baseUrl` obligatoire pour `openai_compatible` et `local`, interdit sinon, `https` public pour `openai_compatible` (contrôle `assertPublicUrl`, ADR-0159) ; `local` refusé avec `422 LOCAL_MODELS_DISABLED` si `ALLOW_LOCAL_MODELS` est faux ; au-delà de 10 identifiants → `422 CREDENTIAL_LIMIT_REACHED` (« Vous avez atteint 10 fournisseurs enregistrés. Supprimez-en un pour en ajouter un autre. »).
- **EF-6** — Doublon exact (même fournisseur, même `baseUrl`, mêmes 4 derniers caractères et même empreinte HMAC de la clé) → `409 CONFLICT` « Cette clé est déjà enregistrée. ».

## 6. Exigences techniques

**ET-1 — Chiffrement** (`packages/llm/src/credentials/crypto.ts`) :
```ts
export function loadKeyring(env): { current: Buffer; previous: Buffer | null }; // vérifie 32 octets, sinon ConfigError
export function encryptSecret(plain: string, aad: string, key: Buffer): Buffer;   // iv(12) ‖ tag(16) ‖ ct
export function decryptSecret(blob: Buffer, aad: string, ring: Keyring): { plain: string; usedPrevious: boolean };
export function credentialAad(credentialId: string, userId: string): string;      // 'learny:ai_credentials:<id>:<userId>'
export function keyFingerprint(plain: string, key: Buffer): string;                 // HMAC-SHA256 hex, stocké dans qualification.keyFingerprint pour EF-6
export function maskKey(last4: string, prefix: string): string;
```
IV par `crypto.randomBytes(12)` ; `createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })` ; `setAAD`. La chaîne en clair est conservée dans une variable locale et n'est jamais passée au logger (le logger SPEC-010 masque en plus les champs `apiKey`, `key`, `authorization`).

**ET-2 — Service** (`packages/services/src/ai/credentials-service.ts`) :
```ts
createCredential(ctx, input: CreateCredentialInput): Promise<Result<CredentialDto, AppError>>;
listCredentials(ctx): Promise<Result<CredentialDto[], AppError>>;
deleteCredential(ctx, id): Promise<Result<void, AppError>>;
markCredentialStatus(ctx, id, status: 'untested'|'qualified'|'failed', report?: QualificationReport): Promise<Result<void, AppError>>; // utilisé par SPEC-506 et par SPEC-504 sur AI_KEY_INVALID
```
Création : génération de l'`id` (uuid v4) côté application pour construire l'AAD, chiffrement, insertion via `userDb(ctx)` (RLS). Colonnes : `encrypted_key` (bytea), `key_last4`, `outside_eu` (catalogue), `status='untested'`, `qualification = { keyFingerprint, keyPrefix }`.

**ET-3 — Lecture serveur de la clé** (`packages/llm/src/credentials/read.ts`) : `decryptCredentialKey(db, { userId, credentialId }) → Result<string | null, AppError>` — utilisable uniquement par `@learny/llm` (export non public du paquet, test d'architecture) ; `null` pour `local` sans clé ; si `usedPrevious`, rechiffrement immédiat avec la clé courante (rotation paresseuse).

**ET-4 — Rotation** (`packages/llm/scripts/rotate-keys.ts`, script racine `pnpm ai:rotate-keys`) et documentation `docs/operations/key-rotation.md` selon ADR-0154 ; sortie : nombre de lignes rechiffrées, déjà à jour, en échec (identifiants seulement).

**ET-5 — Contrats et routes** : `packages/contracts/src/ai-credentials.ts` (schémas EF-1, EF-4) ; `apps/web/app/api/v1/me/ai/credentials/route.ts` (GET, POST) et `[id]/route.ts` (DELETE) via `handler({ auth: true, rateLimit: 'ai', idempotent: true })`. Codes ajoutés : `LOCAL_MODELS_DISABLED`, `CREDENTIAL_LIMIT_REACHED`, `CREDENTIAL_DECRYPT_FAILED` (500, jamais exposé avec détails).

**ET-6 — Anti-SSRF** : création de `packages/core/src/net/{ip-ranges.ts,assert-public-url.ts}` (ADR-0159, points 1, 2 et 7) ; `safeFetch` est complété par SPEC-510.

**ET-7 — Sécurité** : les réponses de l'API ont `Cache-Control: no-store` ; la clé ne transite que dans le corps du POST (HTTPS) ; l'en-tête de journalisation des requêtes de `handler()` ne journalise pas le corps de cette route (`logBody: false`).

## 7. Comportements attendus et cas limites

- **CL-1** `APP_ENCRYPTION_KEY` de 31 octets → `ConfigError` au démarrage (test).
- **CL-2** Chiffré copié sur la ligne d'un autre utilisateur (attaque par permutation) → déchiffrement en échec (`CREDENTIAL_DECRYPT_FAILED`) grâce à l'AAD.
- **CL-3** Rotation interrompue à mi-parcours → relancer le script termine le travail ; aucune ligne n'est perdue (chaque ligne lisible par l'une des deux clés).
- **CL-4** Clé contenant une instruction (« ignore… ») → simple chaîne, chiffrée telle quelle.
- **CL-5** `baseUrl` `https://169.254.169.254/v1` ou `https://localhost` pour un service compatible → `422 URL_BLOCKED_HOST`.
- **CL-6** Suppression d'un identifiant affecté à 2 tâches → les 2 lignes `ai_task_models` disparaissent ; la résolution (SPEC-504) revient à l'IA fournie ou à `AI_UNAVAILABLE`.
- **CL-7** Double soumission du formulaire (même `Idempotency-Key`) → une seule ligne, même réponse.
- **CL-8** Utilisateur B appelle `DELETE` sur l'identifiant de A → `404` ; A conserve sa ligne (test RLS).
- **CL-9** Journaux : une requête POST avec la clé `sk-test-SECRET-1234` ne laisse aucune occurrence de `SECRET` dans la sortie du logger ni dans Sentry simulé.
- **CL-10** Clé révoquée chez le fournisseur : détectée à l'appel ou à la qualification (`AI_KEY_INVALID`) → `markCredentialStatus(..., 'failed')`.

## 8. Instructions d'implémentation

1. `packages/core/src/net/` (ET-6) + tests. Commit `feat(SPEC-505): contrôle d'adresse publique`.
2. `packages/llm/src/credentials/{crypto,read}.ts` + tests. Commit.
3. Catalogue des régions et notes dans `providers/catalog.ts` (ADR-0154). Commit.
4. Service `credentials-service.ts`, contrats, routes, codes d'erreur. Commit.
5. Script de rotation et `docs/operations/key-rotation.md`. Commit.
6. Démonstration et tests. Commits `test(SPEC-505): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/core/src/net/{ip-ranges,assert-public-url,index}.ts`, `packages/llm/src/credentials/{crypto,read,index}.ts`, `packages/llm/scripts/rotate-keys.ts`, `packages/services/src/ai/credentials-service.ts`, `packages/contracts/src/ai-credentials.ts`, `apps/web/app/api/v1/me/ai/credentials/route.ts`, `apps/web/app/api/v1/me/ai/credentials/[id]/route.ts`, `docs/operations/key-rotation.md`, `apps/web/app/_dev/sdd/_demos/spec-505.tsx`, tests §12.
- **Modifiés** : `packages/llm/src/providers/catalog.ts` (régions), `packages/llm/src/providers/factory.ts` (appel de `decryptCredentialKey`), `packages/core/src/errors.ts`, `packages/config/src/env.ts` et `.env.example` (`APP_ENCRYPTION_KEY_PREVIOUS`, `ALLOW_LOCAL_MODELS`), `package.json` racine (script `ai:rotate-keys`), `docs/architecture/api.md` (codes de réponse).

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-505` « SPEC-505 · Clés personnelles » :
- Formulaire `@learny/ui` (`cred-provider`, `cred-model`, `cred-baseurl` visible pour compatible/local, `cred-key` de type mot de passe, `cred-submit`) reprenant les libellés de la maquette Paramètres (« Fournisseur », « Nom du modèle », « Adresse », « Clé d'API », placeholder « Collez votre clé ») ; la note de données s'affiche sous le formulaire selon le fournisseur (fond `#FFEDE0`/`#8F3305` si hors UE, `#ECECFC`/`#2E2E8F` sinon).
- Liste `cred-list` : cartes avec titre, statut (« Non testé »), `keyMasked` (`cred-masked`), pastille « Hors UE », bouton « Supprimer la clé » (`cred-delete`, AlertDialog de confirmation).
- Panneau « Stockage » (`cred-storage`) : pour le dernier identifiant, longueur du chiffré en octets et ses 8 premiers octets en hexadécimal (IV), preuve que la clé n'est pas stockée en clair ; « Réponse brute de l'API » (`cred-raw-json`) affichant le JSON reçu par le navigateur.
- Contrôles visuels : jetons, structure, `toHaveScreenshot`.

## 11. Critères d'acceptation

- **CA-1** Chiffrer puis déchiffrer redonne la clé ; le chiffré fait 28 + n octets ; deux chiffrements de la même clé diffèrent (IV aléatoire) ; un chiffré altéré d'un octet ou déplacé sur une autre ligne est rejeté.
- **CA-2** Après rotation, toutes les lignes sont déchiffrables avec la seule nouvelle clé ; le déchiffrement paresseux rechiffre une ligne ancienne.
- **CA-3** Aucune réponse de l'API, aucun journal et aucune page ne contient la clé en clair (recherche de la chaîne dans les réponses, la sortie du logger et le HTML de la page).
- **CA-4** Le masquage donne `sk-••••••••a91F` pour `sk-proj-…a91F` et `••••••••7Kq2` pour une clé sans préfixe.
- **CA-5** `outsideEu` et la note correspondent au tableau d'ADR-0154 pour les 6 fournisseurs.
- **CA-6** Les validations d'EF-5 et EF-6 renvoient les codes attendus (8 cas), dont `URL_BLOCKED_HOST` et `LOCAL_MODELS_DISABLED`.
- **CA-7** Un second utilisateur ne peut ni lister ni supprimer les identifiants du premier ; la suppression retire les affectations de tâches.
- **CA-8** La démonstration ajoute, affiche masquée et supprime une clé (vidéo).

## 12. Plan de tests

**Unitaires** (`describe('[SPEC-505] …')`) : `packages/llm/src/credentials/crypto.test.ts` (CA-1, CL-1, CL-2, propriété fast-check aller-retour), `mask.test.ts` (CA-4), `packages/core/src/net/assert-public-url.test.ts` (30 adresses : privées IPv4/IPv6, mappées, métadonnées, ports, schémas, identifiants), `providers/catalog.test.ts` (CA-5). **Injection** : `crypto.test.ts` « clé contenant une instruction » (CL-4) chiffrée/déchiffrée à l'identique.

**Intégration** (`packages/services/test/integration/ai-credentials.test.ts`, `describe('[SPEC-505] identifiants IA')`) : création/liste/suppression via les routes (`next-test-api-route-handler`), validations (CA-6), idempotence (CL-7), isolation RLS (CA-7, CL-8), suppression des affectations (CL-6), absence de la clé dans les réponses et dans un logger capturé (CA-3, CL-9), rotation sur 250 lignes avec interruption simulée puis reprise (CA-2, CL-3).

**End-to-end** (`apps/web/e2e/specs/p5/spec-505-credentials.spec.ts`) : `test('ajouter et supprimer une clé personnelle @SPEC-505', …)` : choisir OpenAI, saisir `gpt-5-mini` et `sk-test-0000000000a91F`, enregistrer → carte « OpenAI », `sk-••••••••a91F`, pastille « Hors UE » ; vérifier que `cred-raw-json` et le HTML de la page ne contiennent pas `0000000000` ; supprimer avec confirmation → liste vide. Vidéo (CA-8, CA-3).

**Visuel** : `test('démonstration des clés @SPEC-505 @visual', …)` : jetons (notes hors UE), structure, `toHaveScreenshot('spec-505-demo.png')`.

**Non-régression** : `[SPEC-504]`, `[SPEC-113]`, `@SPEC-010`.

| Critère | Tests |
|---|---|
| CA-1 | `crypto.test.ts` |
| CA-2 | `ai-credentials.test.ts` (rotation) |
| CA-3 | `ai-credentials.test.ts`, e2e |
| CA-4 | `mask.test.ts`, e2e |
| CA-5 | `catalog.test.ts` |
| CA-6 | `ai-credentials.test.ts`, `assert-public-url.test.ts` |
| CA-7 | `ai-credentials.test.ts` |
| CA-8 | `spec-505-credentials.spec.ts` (@SPEC-505, @visual) |

## 13. Preuves attendues

`evidence/SPEC-505/` : vidéo, captures du formulaire et de la carte masquée, extrait JSON de la réponse API (sans clé), sortie du script de rotation sur la base de test (`rotation.txt`), rapports.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; `docs/operations/key-rotation.md` rédigé ; analyse gitleaks sans alerte sur les fixtures (clés de test au format factice `sk-test-…`).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0019, ADR-0022, ADR-0042, ADR-0053.
- Décisions créées : **ADR-0154** (format, AAD, rotation, masquage, régions, modèles locaux) et **ADR-0159** (anti-SSRF, dont la partie validation d'adresse est livrée ici).
- Pas de route de modification : changer de clé = supprimer puis ajouter (comme la maquette : « Supprimer la clé », « Tester à nouveau »).
- La pastille « Hors UE » de l'IA fournie n'est pas affichée (maquette) ; ce point est à revérifier lors de la mise en production (SPEC-808).
