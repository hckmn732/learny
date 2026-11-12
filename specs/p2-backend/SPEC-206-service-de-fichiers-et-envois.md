---
id: SPEC-206
title: Service de fichiers et envois
phase: P2
priority: V1
depends_on: [SPEC-114, SPEC-201]
business_rules: [BR-APP-02]
screens: []
adrs: [ADR-0039, ADR-0058]
visual: demo
---

# SPEC-206 — Service de fichiers et envois

## 1. Objectif

Fournir les URL d'envoi/lecture signées et la finalisation sécurisée d'un apport, avec contrôle du type réel, des bornes par format et du quota de stockage. Refuser une ressource non conforme avec un code métier précis et assurer une suppression qui préserve l'historique des citations.

## 2. Contexte

SPEC-114 livre les buckets privés et signatures de dix minutes ; SPEC-201 livre le wrapper API. `docs/architecture/api.md` §2 inventorie les routes apports ; `docs/architecture/data-model.md` §3–§4 définit ressources, passages et citations. BR-APP-02 et ADR-0039 fixent les limites et la suppression ; ADR-0058 fixe le chemin et la durée de signature. Lire SPEC-104, `docs/engineering/conventions.md` §7–§9 et `docs/product/business-rules.md` BR-APP-01/03/10. L'interface de dépôt est livrée par SPEC-607 ; ce service en assure les garanties serveur.

## 3. Dépendances

- **SPEC-114** : buckets `resources`/`exports`, chemins privés, politiques Storage et URL signées.
- **SPEC-201** : `handler`, session, Zod, `problem+json` et clé d'idempotence sur création.
- **SPEC-104** : table `resources` et statuts, `resource_chunks` pour suppression.
- **SPEC-009** : bornes `product.ts`, sans valeur métier en dur dans les handlers.

## 4. Règles métier couvertes

- **BR-APP-02** : PDF ≤ 50 Mo/500 pages, image ≤ 10 Mo parmi JPEG/PNG/WebP/HEIC, note ≤ 100 000 caractères, ≤ 100 apports par chapitre et stockage total ≤ 2 Go par utilisateur. Chaque dépassement est refusé avec message et code explicites avant d'accepter définitivement l'objet.

## 5. Exigences fonctionnelles

- **EF-1** — `POST /api/v1/chapters/:cid/uploads` vérifie propriétaire du chapitre, nombre d'apports, quota réservé et type déclaré, crée une ressource `queued` et renvoie `{resourceId, uploadUrl, expiresAt}` avec URL signée dix minutes. L'URL cible exclusivement `<userId>/<resourceId>/<nom>`.
- **EF-2** — `POST /api/v1/resources/:rid/finalize` lit l'objet déjà envoyé, mesure les octets réels, détecte le MIME à partir de la signature binaire, compte les pages PDF et vérifie le quota total sous transaction. En succès, renseigne `mime`/`size_bytes`/`storage_path` et émet `resource/uploaded` une seule fois.
- **EF-3** — Une note texte passe par `POST /api/v1/chapters/:cid/resources` sans blob : texte/Markdown ≤ 100 000 caractères et mêmes limites de chapitre/propriété. Une URL web/YouTube ou image non finalisée ne devient jamais `ready` par cette route.
- **EF-4** — `getSignedReadUrl(userId, resourceId)` vérifie la ligne DB, l'appartenance et l'absence de `deleted_at`, puis rend une URL valable dix minutes. Un ID d'autrui reçoit 404/403 sûr, sans révéler le chemin.
- **EF-5** — `DELETE /api/v1/resources/:rid` marque la ressource supprimée, enlève le blob et ses `resource_chunks`, puis laisse les lignes `citations` avec `chunk_id=null` et label « source supprimée ». La suppression répétée est idempotente.
- **EF-6** — Erreurs normalisées : `UPLOAD_TOO_LARGE` pour taille/pages, `UNSUPPORTED_TYPE` pour type réel, `QUOTA_EXCEEDED` pour 100 apports/2 Go, `FORBIDDEN` pour autre propriétaire et `NOT_FOUND` pour ID absent. Les réponses suivent `application/problem+json`.
- **EF-7** — La page SDD permet des essais simulés « PDF 50 Mo/500 pages accepté », « 501 pages refusé », « image > 10 Mo refusée », « quota atteint », et affiche le code retourné par le service sans créer de gros fichier dans le navigateur.

## 6. Exigences techniques

- **ET-1** — Contrats Zod de création/finalisation/lecture/suppression dans `packages/contracts/src/uploads.ts` ; routes fines dans `apps/web/app/api/v1` qui appellent `packages/services/src/resources`.
- **ET-2** — Le service détecte MIME par les premiers octets et bibliothèque adaptée, pas par extension ou `Content-Type` client. PDF pages mesuré par parseur sans exécuter script ; données hostiles/endommagées refusées.
- **ET-3** — Quota de 2 Go calculé sur `resources.size_bytes` non supprimées plus réservations non finalisées ; verrou transactionnel par utilisateur/chapitre pour éviter deux envois simultanés dépassant la limite. Une réservation expirée libère sa place.
- **ET-4** — Le chemin Storage et les signatures passent par SPEC-114. Aucune URL signée n'est journalisée, stockée dans une colonne ou exposée à un autre utilisateur.
- **ET-5** — La finalisation est idempotente sur `resourceId` et empreinte d'objet : deux appels identiques rendent le même état, un objet changé après finalisation est rejeté.
- **ET-6** — La suppression des passages et la conservation des citations sont transactionnelles côté DB ; l'effacement Storage est un job idempotent repris en cas d'échec. La ressource reste inaccessible dès `deleted_at`, même si le blob attend le nettoyage.
- **ET-7** — Les fichiers V2 audio/vidéo sont rejetés en V1 selon ADR-0008 malgré la présence de leurs enums DB ; SPEC-901/902 activeront leur import.

## 7. Comportements attendus et cas limites

- **CL-1** — PDF de 50 Mo et 500 pages exactement : accepté ; un octet ou une page au-delà : `UPLOAD_TOO_LARGE`.
- **CL-2** — Image de 10 Mo exactement acceptée si type réel autorisé ; extension `.png` sur un exécutable : `UNSUPPORTED_TYPE`.
- **CL-3** — 100 apports existants dans un chapitre ou quota 2 Go atteint : `QUOTA_EXCEEDED` sans URL d'envoi supplémentaire.
- **CL-4** — Deux finalisations concurrentes : une ressource, un événement, volume compté une fois.
- **CL-5** — URL signée expirée : renvoyer une nouvelle seulement après auth et propriété ; ne pas prolonger l'ancienne.
- **CL-6** — Fichier absent ou tronqué après URL d'envoi : finalisation refusée, réservation libérée après expiration.
- **CL-7** — Utilisateur membre d'un groupe tente de lire l'apport d'un autre membre : refus.
- **CL-8** — Suppression avec échec Storage : accès DB révoqué immédiatement, nettoyage repris sans perdre citations.

## 8. Instructions d'implémentation

1. Écrire contrats et routes de création, lecture, finalisation et suppression, avec auth/idempotence. Commit `feat(SPEC-206): expose les envois privés`.
2. Implémenter détection MIME/pages, réservations de quota et finalisation transactionnelle, puis émission d'événement. Commit `feat(SPEC-206): contrôle les limites réelles`.
3. Implémenter suppression différée du blob, retrait des chunks et conservation des citations. Commit `feat(SPEC-206): supprime les apports sans perdre les sources`.
4. Ajouter tests de bornes, concurrence/RLS, page SDD et visuel ; valider et joindre les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/uploads.ts`, `packages/services/src/resources/{create-upload,finalize,read,delete}.ts`, `packages/services/src/resources/upload.test.ts`, `packages/services/test/integration/uploads.test.ts`, routes `apps/web/app/api/v1/chapters/[cid]/uploads/route.ts` et `apps/web/app/api/v1/resources/[rid]/{finalize,route}.ts` selon App Router, `apps/web/components/sdd-demos/spec-206.tsx`, `apps/web/e2e/specs/p2/spec-206.spec.ts`.
- **Modifiés** : `packages/core/src/errors.ts`, `packages/jobs/src/events.ts`, `packages/contracts/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `resources`, `resource_chunks`, `citations`, Storage SPEC-114 et `handler` SPEC-201.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-206` présente « Envois privés », quatre cartes de limites (PDF, image, note, quota), une table d'essais avec états accepté/refusé et codes, puis un exemple « source supprimée ». `data-testid` : `spec-206-limits`, `spec-206-cases`, `spec-206-deletion`. Les tailles sont des entrées simulées au service, pas des fichiers de 2 Go. La page annonce chaque résultat en texte, supporte clavier et 390 px. Vérifier jetons, ordre, axe et captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les bornes exactes de BR-APP-02 sont appliquées au fichier réel/texte et les trois codes métier sont renvoyés correctement.
- **CA-2** — Deux finalisations ou créations concurrentes ne doublent ni quota ni événement et ne dépassent pas 100 apports/2 Go.
- **CA-3** — Un membre du même groupe ne lit ni n'efface l'apport d'autrui ; URL de lecture expire après dix minutes.
- **CA-4** — La suppression retire passages/blob, laisse les citations « source supprimée » et est idempotente.
- **CA-5** — La page SDD montre limites, erreurs et suppression, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/resources/upload.test.ts`, `describe('[SPEC-206] upload limits')` : 50 Mo/500 pages, 10 Mo, note 100 000, MIME falsifié et codes (CA-1).
- **Intégration** — `packages/services/test/integration/uploads.test.ts`, `describe('[SPEC-206] upload service')` : Storage local, deux JWT, finalisation concurrente, quota, URL expirée, suppression/chunks/citations, reprise Storage (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-206.spec.ts`, `test('inspecte les limites d'envoi @SPEC-206')` : parcourir cas acceptés/refusés de la page, vidéo (CA-5).
- **Visuel** — `test('envois conformes @SPEC-206 @visual')` : structure, jetons, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-114]` et `[SPEC-201]`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration MIME/pages |
| CA-2 | intégration concurrence |
| CA-3 | intégration RLS/TTL |
| CA-4 | intégration suppression |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-206/` contient rapports, sorties de bornes et concurrence, test d'isolation, état des citations après suppression, vidéo/captures, `checks.json` et `acceptance.md`. Aucun apport privé réel ni URL signée ne figure dans les preuves.

## 14. Définition de terminé

Les validations de `docs/engineering/testing.md` §7 passent ; le contrôle porte sur les octets réels, le quota reste juste sous concurrence, RLS protège les fichiers et les citations restent consultables après suppression.

## 15. Décisions et hypothèses

ADR-0039 fixe les bornes et la conservation des citations, ADR-0058 les buckets/chemins/TTL. Les fichiers audio/vidéo restent V2 selon ADR-0008. SPEC-607 fournit le parcours utilisateur de dépôt.

Décisions prises pendant l'implémentation (sans solliciter l'utilisateur) :

- **ADR-0255** — suivi d'envoi dans `resources.metadata.upload` (réservation, empreinte, marqueurs), quota = octets finalisés + réservations vivantes, réservation expirée libérée au prochain envoi, et idempotence de création portée par le service afin qu'aucune URL signée ne soit stockée (`idempotency_keys` mémorise les réponses 24 h).
- **ADR-0256** — jeton Storage de 60 s émis au nom de l'apprenant, lecture des octets réels par flux borné (`file-type`, `unpdf`), horloge réelle pour Storage et horloge injectable pour les réservations.
- **ADR-0257** — refus définitifs libèrent l'envoi, objet absent ou tronqué réessayable (`UPLOAD_INCOMPLETE`), émission unique de `resource/uploaded` par revendication, suppression transactionnelle qui conserve les citations « source supprimée » et nettoyage Storage repris par `purgeDeletedBlobs`.
- Les codes `UNSUPPORTED_TYPE`, `QUOTA_EXCEEDED` (422) et `UPLOAD_INCOMPLETE` (422) sont ajoutés au catalogue d'erreurs ; la lecture signée est exposée par `GET /api/v1/resources/:rid/url`.
