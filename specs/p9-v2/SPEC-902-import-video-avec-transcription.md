---
id: SPEC-902
title: Import vidéo avec transcription
phase: P9
priority: V2
depends_on: [SPEC-901]
business_rules: [BR-APP-09]
screens: [SCR-06]
adrs: [ADR-0008, ADR-0205]
visual: mockup
---

# SPEC-902 — Import vidéo avec transcription

## 1. Objectif

Ajouter l'import de fichiers vidéo à un chapitre, extraire uniquement leur piste sonore pour la transcription, créer des passages horodatés et permettre au cours d'ouvrir l'extrait vidéo cité au bon instant. Réutiliser les contrats de transcription et de confidentialité audio de SPEC-901.

## 2. Contexte

ADR-0008 réserve les fichiers vidéo à V2, tandis que les vidéos YouTube sous-titrées sont déjà des apports V1 distincts. Lire BR-APP-03/06/07/09/10, `docs/architecture/data-model.md` §3–§4, `docs/product/screens.md` SCR-06/07, `docs/engineering/testing.md` §3–§6, SPEC-206, SPEC-509, SPEC-510, SPEC-901 et ADR-0205. Le type `resource_kind='video'` existe en base ; l'UI ne l'expose qu'avec cette spécification. La transcription sert aux passages et aux citations, mais le fichier original reste la source que l'apprenant peut lire.

## 3. Dépendances

- **SPEC-901** : `TranscriptionProvider`, validation des segments, adaptateur Deepgram/mock, passage horodaté et lecteur de citation signé.
- **SPEC-206/114** : finalisation d'envoi avec MIME réel, quota 2 Go et bucket privé.
- **SPEC-509/510** : job d'ingestion, découpage/embeddings et distinction du type YouTube.
- **Externe** : outil local d'extraction audio versionné et disponible dans l'image de traitement, puis Deepgram avec `DEEPGRAM_API_KEY` côté serveur ; en test, piste et transcription fixtures, sans réseau fournisseur.

## 4. Règles métier couvertes

- **BR-APP-09** : un fichier vidéo importé en V2 est transcrit automatiquement ; ses passages permettent une citation horodatée et l'ouverture de l'extrait vidéo correspondant.

## 5. Exigences fonctionnelles

- **EF-1** — SCR-06 offre l'option « Vidéo » pour un fichier MP4, WebM ou MOV, au plus 500 Mo et 2 h, sous quota global 2 Go (ADR-0205). La carte d'apport affiche titre, durée, taille, statut et une vignette sûre générée localement si possible ; aucune vignette distante n'est requise pour terminer l'import.
- **EF-2** — La finalisation vérifie MIME réel, taille et durée avant d'émettre `resource/uploaded`; la ressource est enregistrée avec `kind='video'`, chemin privé, `metadata.durationSec`, statut `queued` et propriétaire. Le traitement passe par « En file », « En cours », « Prêt » ou « Échec », avec raison et « Réessayer ».
- **EF-3** — Le job extrait la piste audio sans modifier le fichier original, la transmet à l'adaptateur de transcription de SPEC-901, valide les segments, écrit `content_text` et `resource_chunks` avec `startSec/endSec`, puis calcule les embeddings. Un fichier sans piste sonore exploitable échoue avec « Aucune piste audio transcrivable » et ne produit pas un transcript vide prétendument prêt.
- **EF-4** — Un passage de cours peut citer la vidéo avec `media_kind='video'`, libellé « Vidéo, mm:ss » et localisation du segment. Le clic crée une URL signée après vérification du propriétaire, ouvre le lecteur vidéo à `startSec` avec sous-titre textuel du passage et permet lecture/pause/avance au clavier.
- **EF-5** — L'import de fichier vidéo reste distinct d'une URL YouTube : cette dernière utilise ses sous-titres, n'est pas copiée dans Storage et garde `kind='youtube'`. Les deux peuvent apparaître sur le même chapitre sans fusion d'identifiants ou de citations.
- **EF-6** — Renommer, supprimer ou réessayer une vidéo suit le même contrat que SPEC-901. La suppression retire le fichier et les passages privés ; les citations existantes affichent « source supprimée » sans lecteur.
- **EF-7** — La durée, le MIME, l'erreur de transcription et l'état sont annoncés dans l'UI, y compris sur mobile. Un utilisateur sans accès au fichier n'obtient ni URL signée, ni transcription, ni vignette privée.

## 6. Exigences techniques

- **ET-1** — `packages/ingestion/src/video/extract-audio.ts` exécute l'outil d'extraction avec arguments séparés, chemin temporaire non dérivé du nom de fichier, limite de temps et de taille de sortie ; ne lance aucune chaîne de shell construite depuis le titre utilisateur. Les fichiers temporaires sont supprimés en `finally`.
- **ET-2** — L'extraction détecte la durée et la présence d'une piste audio ; le service de finalisation bloque déjà un fichier hors limites, et le job revérifie les métadonnées avant traitement. Les bornes viennent de `packages/config/src/product.ts` selon ADR-0205.
- **ET-3** — Les étapes Inngest `extract-video-audio`, `transcribe-video`, `persist-video-chunks`, `embed-video-chunks` sont idempotentes sur `(resourceId, version)` ; un redémarrage après transcription ne relance pas inutilement le fournisseur ni ne double les passages.
- **ET-4** — La sortie de transcription utilise exactement le schéma `Segment` de SPEC-901. `location` enregistre `startSec/endSec`; les `citations` conservent `resource_id`, `chunk_id`, `media_kind='video'` et `label` vérifiés par le service de cours.
- **ET-5** — Le composant lecteur reçoit une URL courte de SPEC-206 après contrôle `userDb(ctx)` ; la piste texte de transcription est servie uniquement au propriétaire. Les en-têtes de la réponse vidéo empêchent le cache public et respectent la CSP de SPEC-805.
- **ET-6** — Le mock d'intégration fournit un petit fichier vidéo avec piste audio et segments connus, plus un fichier sans piste ; aucune étape CI n'appelle Deepgram ou ne nécessite un codec non installé dans l'image de test.

## 7. Comportements attendus et cas limites

- **CL-1** — Fichier > 500 Mo, > 2 h, mauvais MIME ou quota dépassé : refus avant l'événement et avant l'extraction.
- **CL-2** — Vidéo sans audio : `failed` avec raison lisible et bouton « Réessayer » seulement si une nouvelle version/fichier est fourni ; aucun transcript fictif.
- **CL-3** — Extraction interrompue : nettoyage des fichiers temporaires, statut d'échec et reprise sans double transcription.
- **CL-4** — Segments Deepgram incohérents : rejet selon SPEC-901, pas de `ready` partiel.
- **CL-5** — Deux livraisons d'événement : une série de chunks et un seul fichier original conservé.
- **CL-6** — URL signée expirée pendant lecture : le lecteur demande une nouvelle URL si la session est encore valide ; aucun jeton durable dans le DOM.
- **CL-7** — Autre membre du groupe ou compte B : refus d'accès au fichier, aux sous-titres et à la vignette.
- **CL-8** — Citation vers vidéo supprimée : « source supprimée », pas de requête de lecture.

## 8. Instructions d'implémentation

1. Étendre la validation serveur et l'UI d'apports avec la limite vidéo ADR-0205, sans modifier l'option YouTube ; tests de formats/quota. Commit `feat(SPEC-902): accepte les fichiers vidéo V2`.
2. Écrire l'extraction audio sûre et ses fixtures (piste présente/absente), brancher les étapes idempotentes du job puis le provider SPEC-901. Commit `feat(SPEC-902): extrait et transcrit la piste vidéo`.
3. Ajouter les citations vidéo et le lecteur signé avec positionnement, sous-titres et états d'erreur ; tests de confidentialité. Commit `feat(SPEC-902): ouvre les extraits vidéo cités`.
4. Écrire tests unitaires, intégration et parcours Playwright, comparer SCR-06, puis exécuter la validation SDD et renseigner les preuves réelles.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ingestion/src/video/extract-audio.ts`, `packages/ingestion/src/video/extract-audio.test.ts`, `packages/ingestion/src/video/ingest-video.ts`, `packages/ingestion/test/integration/video.test.ts`, `packages/ingestion/fixtures/video-with-audio.mp4`, `packages/ingestion/fixtures/video-silent.mp4`, `apps/web/components/resources/video-upload.tsx`, `apps/web/components/course/video-citation-player.tsx`, `apps/web/e2e/specs/p9/spec-902.spec.ts`.
- **Modifiés** : `packages/config/src/product.ts`, `packages/jobs/src/functions/ingest-resource.ts`, `packages/contracts/src/resources.ts`, service de finalisation SPEC-206, composants du module/cours SPEC-607/609, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `TranscriptionProvider` et `Segment` SPEC-901, `userDb`, URLs signées, maquette `Module.dc.html`.

## 10. Interface et conformité visuelle

Mode `mockup` sur SCR-06. La zone d'apports garde l'ordre et les jetons de `design/maquettes/Module.dc.html`; l'option « Vidéo » s'ajoute à côté d'« Audio ». La carte prête montre icône/vignette, titre, durée et statut, puis « Lire l'extrait » ; un panneau lecteur expose `<video controls>`, titre, temps et transcription textuelle. `data-testid` : `resource-video-option`, `resource-video-status`, `resource-video-player`, `citation-video`. Les contrôles sont accessibles au clavier et les sous-titres restent lisibles à 200 % de zoom.

Comparer les régions communes de SCR-06 à leur référence ≤ 12 % selon ADR-0161 ; contrôler le lecteur nouveau par jetons, structure et ligne de base `toHaveScreenshot('module-video.png', { maxDiffPixelRatio: 0.01 })`, desktop/mobile. Axe ne signale aucune violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — Une vidéo valide passe de `queued` à `ready`, possède une transcription horodatée et des embeddings ; hors format/taille/durée/quota est refusé avant extraction.
- **CA-2** — Un fichier sans piste audio et une extraction interrompue affichent une erreur, nettoient les temporaires et ne créent pas de transcript fictif.
- **CA-3** — Une citation « Vidéo, mm:ss » ouvre le fichier privé à la seconde correcte avec texte du passage ; une URL expirée est renouvelée uniquement pour le propriétaire.
- **CA-4** — Un doublon d'événement ne double pas les passages ; un autre utilisateur ne peut obtenir ni vidéo, ni transcription, ni URL signée.
- **CA-5** — L'interface SCR-06 conserve les régions V1, passe axe et les comparaisons desktop/mobile ; une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `extract-audio.test.ts`, `describe('[SPEC-902] video extraction')` : MIME, taille, durée, piste absente, arguments sûrs, nettoyage, segment et libellé mm:ss (CA-1–CA-3).
- **Intégration** — `packages/ingestion/test/integration/video.test.ts`, `describe('[SPEC-902] video ingestion')` : upload, extraction fixture, mock Deepgram, chunks, double événement, panne, RLS, URL signée et suppression (CA-1–CA-4).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-902.spec.ts`, `test('importe et lit une vidéo @SPEC-902')` : déposer fixture, attendre Prêt, ouvrir une citation à 01:12, vérifier lecteur/sous-titre, conserver la vidéo Playwright (CA-1, CA-3, CA-5).
- **Visuel** — `test('apport vidéo conforme @SPEC-902 @visual')` : comparaison des régions SCR-06, jetons du panneau, axe et captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — SPEC-901, SPEC-510 (YouTube), SPEC-607/609 et SPEC-805.

| Critère | Tests |
|---|---|
| CA-1 | unitaires limites ; intégration ; e2e |
| CA-2 | unitaires extraction ; intégration panne |
| CA-3 | intégration URL ; e2e lecteur |
| CA-4 | intégration idempotence/RLS |
| CA-5 | e2e `@SPEC-902 @visual` |

## 13. Preuves attendues

`evidence/SPEC-902/` : rapports extraction/ingestion, compte des chunks, preuve de suppression des temporaires, vidéo e2e de lecture à 01:12, captures et diff SCR-06, `checks.json`, `acceptance.md`. Le rapport distingue mock de transcription et service live ; aucune transcription réelle n'est prétendue si seule la fixture a été utilisée.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 passent. L'extraction ne fuit aucun temporaire, les limites et RLS sont imposées côté serveur, les citations ouvrent la bonne seconde et les apports YouTube V1 restent fonctionnels.

## 15. Décisions et hypothèses

ADR-0008 réserve l'import de fichiers vidéo à V2 ; ADR-0205 fixe formats, limites et segments. La transcription n'est pas une correction du contenu vidéo : elle est un apports de recherche et de citation, conservé avec sa source et sa version. Le fournisseur est mock en CI, conformément à ADR-0048.
