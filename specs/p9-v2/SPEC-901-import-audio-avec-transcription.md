---
id: SPEC-901
title: Import audio avec transcription
phase: P9
priority: V2
depends_on: [SPEC-509]
business_rules: [BR-APP-08]
screens: [SCR-06]
adrs: [ADR-0008, ADR-0205]
visual: mockup
---

# SPEC-901 — Import audio avec transcription

## 1. Objectif

Permettre l'ajout d'un fichier audio à un chapitre, sa transcription automatique et son découpage en passages horodatés. Une citation du cours renvoie à la minute précise et ouvre la lecture de l'extrait, tout en conservant l'apport privé au propriétaire.

## 2. Contexte

ADR-0008 réserve les fichiers audio à V2 ; l'énumération `resource_kind` contient déjà `audio` en V1 sans exposer l'option dans l'interface. Lire `docs/product/business-rules.md` BR-APP-01/02/03/06/07/08/10, `docs/architecture/data-model.md` §3–§4 (`resources`, `resource_chunks`, `citations`), `docs/product/screens.md` SCR-06 et SCR-07, `docs/engineering/testing.md` §3–§6, SPEC-206/509/607/609 et ADR-0205. Le pipeline existant extrait notes/PDF ; cette spécification lui ajoute une branche audio sans changer les autres formats.

## 3. Dépendances

- **SPEC-509** : statut d'ingestion, découpage, embeddings, indexation et reprise du job `resource/uploaded`.
- **SPEC-206/114** : envoi et lecture signés dans le bucket privé, vérification MIME et quota utilisateur.
- **SPEC-607/609** : écran des apports SCR-06 et lecteur de citations du cours SCR-07.
- **Externe** : Deepgram via `DEEPGRAM_API_KEY` côté serveur. En test, adaptateur mock et fixture de transcription déterministe ; sans clé live, statut `failed` avec raison et « Réessayer », sans transcript inventé.

## 4. Règles métier couvertes

- **BR-APP-08** : un fichier audio peut être importé en V2 et transcrit automatiquement. Les passages issus de la transcription sont horodatés pour les citations et la recherche.

## 5. Exigences fonctionnelles

- **EF-1** — Dans SCR-06, l'option « Audio » apparaît à côté des autres apports seulement en V2. Elle accepte MP3, M4A, WAV et WebM, au plus 200 Mo et 2 h (ADR-0205), sous le quota total de 2 Go par utilisateur. Le nom, la taille et la durée sont affichés avant confirmation ; un format, taille, durée ou quota invalide produit un message précis.
- **EF-2** — L'envoi passe par l'URL signée du propriétaire ; une fois finalisé, `resources.kind='audio'`, `status='queued'`, `mime`, `size_bytes`, `storage_path` et `metadata.durationSec` sont enregistrés. L'interface montre « En file », « En cours », « Prêt » ou « Échec » avec raison et « Réessayer » conformément à BR-APP-07.
- **EF-3** — Le job lit le fichier privé, l'envoie au service de transcription, valide la langue/les segments et stocke `content_text` ainsi que des `resource_chunks` ordonnés. Chaque passage a `location.startSec`, `endSec`, position et texte non vide ; les embeddings suivent le pipeline SPEC-509. Le statut ne devient `ready` qu'après stockage de tous les passages et embeddings requis.
- **EF-4** — Le cours peut citer un passage audio avec libellé « Note vocale, mm:ss » et `media_kind='audio'`. Le clic ouvre un lecteur accessible à `startSec`, avec les mots du passage et le titre de l'apport ; une URL de lecture signée courte est créée au moment de l'ouverture, jamais enregistrée dans le cours.
- **EF-5** — L'apprenant peut renommer, supprimer ou réessayer l'apport comme les autres formats. La suppression retire le fichier et les passages sensibles mais garde la citation historique marquée « source supprimée » selon BR-APP-10.
- **EF-6** — Une transcription en échec (service indisponible, aucun mot, segments incohérents) garde l'apport visible en `failed` avec code sûr et bouton « Réessayer » ; le nouvel essai ne crée ni passages ni facturation en double pour une tentative déjà aboutie.

## 6. Exigences techniques

- **ET-1** — `packages/ingestion/src/transcription/` définit `TranscriptionProvider.transcribe({ file, mime, resourceId }): Promise<Segment[]>` et deux adaptateurs `deepgram`/`mock`. Le mock lit une fixture JSON versionnée ; aucune requête réseau fournisseur n'est faite sous `LLM_MODE=mock`.
- **ET-2** — Le service de finalisation vérifie le MIME réel, la taille, la durée et le quota avant l'événement d'ingestion. La validation serveur ne se fie pas à `accept` de l'input HTML. Les limites sont centralisées dans `packages/config/src/product.ts` selon ADR-0205.
- **ET-3** — Le job `resource/uploaded` branche `kind='audio'` vers une étape `transcribe-audio` idempotente puis `persist-audio-chunks` et `embed-chunks`; chaque étape a une clé stable sur `(resourceId, version)` pour permettre la reprise sans doublons.
- **ET-4** — `Segment` est validé par Zod : `text.trim().length>0`, `startSec>=0`, `endSec>startSec`, segments ordonnés sans chevauchement invalidant ; les positions sont en secondes et restent liées à la version de ressource.
- **ET-5** — Les lectures du fichier et des passages utilisent `userDb(ctx)` et un chemin de stockage préfixé par le propriétaire. Une URL signée n'est délivrée qu'après vérification d'appartenance ; aucun membre de groupe ne reçoit l'audio privé d'un autre.
- **ET-6** — Le lecteur est un composant client isolé avec contrôle lecture/pause, durée annoncée, piste de texte et clavier ; la page serveur n'envoie pas la clé Deepgram ni l'URL de stockage permanente.

## 7. Comportements attendus et cas limites

- **CL-1** — Faux MIME, fichier > 200 Mo, durée > 2 h ou quota > 2 Go : refus avant appel Deepgram et suppression de l'envoi temporaire.
- **CL-2** — Deepgram indisponible : `failed`, raison lisible, réessai idempotent ; aucun contenu texte de remplacement.
- **CL-3** — Segments vides, négatifs, inversés ou hors durée : transcription rejetée, pas de `ready` partiel.
- **CL-4** — Deux événements `resource/uploaded` simultanés : un seul transcript logique et une seule série de passages.
- **CL-5** — Citation vers apport supprimé : « source supprimée », aucun lecteur ni URL signée.
- **CL-6** — Utilisateur B connaît l'ID de l'audio de A : lecture, transcript et URL signée refusés.
- **CL-7** — Lecture à une seconde au-delà de la durée : borne corrigée au dernier instant valable ; une citation avec temps négatif est refusée à la création.

## 8. Instructions d'implémentation

1. Ajouter les limites audio et le contrat `Segment`, puis les tests MIME/durée/quota ; brancher l'option Audio sur SCR-06 sans l'exposer aux builds V1. Commit `feat(SPEC-901): autorise l'apport audio V2`.
2. Écrire les adaptateurs Deepgram/mock, la fixture horodatée et les étapes idempotentes du job ; persister les passages et embeddings. Commit `feat(SPEC-901): transcrit et indexe les apports audio`.
3. Ajouter `media_kind='audio'`, le libellé mm:ss et le lecteur de citation signé dans le cours ; préserver le comportement source supprimée. Commit `feat(SPEC-901): ouvre les citations audio à la minute`.
4. Écrire tests unitaires, intégration, e2e/visuels, puis valider et enregistrer les preuves réelles en mode mock. Le test live n'est optionnel que hors CI ; ne pas prétendre l'avoir exécuté sans clé.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ingestion/src/transcription/types.ts`, `packages/ingestion/src/transcription/deepgram.ts`, `packages/ingestion/src/transcription/mock.ts`, `packages/ingestion/src/transcription/audio.ts`, `packages/ingestion/src/transcription/audio.test.ts`, `packages/ingestion/test/integration/audio.test.ts`, `packages/ingestion/fixtures/audio-sap.json`, `apps/web/components/resources/audio-upload.tsx`, `apps/web/components/course/audio-citation-player.tsx`, `apps/web/e2e/specs/p9/spec-901.spec.ts`.
- **Modifiés** : `packages/config/src/product.ts`, `packages/jobs/src/functions/ingest-resource.ts`, `packages/contracts/src/resources.ts`, `packages/services/src/resources/`, `apps/web/app/(app)/formations/[fid]/modules/[mid]/page.tsx`, composants de cours SPEC-609, `apps/web/messages/fr.ts`, `.env.example` si le mode Deepgram y manque.
- **Lus / réutilisés** : buckets SPEC-114, URL signées SPEC-206, pipeline SPEC-509, références de SCR-06/07.

## 10. Interface et conformité visuelle

Mode `mockup` sur SCR-06 (`design/maquettes/Module.dc.html`) : la zone de dépôt conserve la structure, les jetons et l'ordre des apports V1 ; « Audio » ajoute une option dans la rangée de formats, sans changer les cartes existantes. Un apport prêt montre icône audio, titre, durée `mm:ss`, statut « Prêt », bouton Lire ; le lecteur s'ouvre dans une région nommée avec transcription et contrôles clavier. Un apport en échec montre raison et « Réessayer » au même emplacement que les autres formats. `data-testid` : `resource-audio-option`, `resource-audio-status`, `resource-audio-player`, `citation-audio`.

Comparer les régions communes de SCR-06 à la référence selon ADR-0161 (≤ 12 %), vérifier jetons, structure et `toHaveScreenshot('module-audio.png', { maxDiffPixelRatio: 0.01 })` sur desktop/mobile. Le lecteur nouveau, absent de la maquette V1, est contrôlé par jetons, structure et non-régression ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — Un audio MP3 valide est envoyé, transcrit en segments horodatés et passe de `queued` à `ready` ; un fichier hors limites est refusé avant fournisseur.
- **CA-2** — Les passages sont ordonnés, non vides, indexés et citables ; le clic sur « Note vocale, mm:ss » ouvre le lecteur à la seconde correcte.
- **CA-3** — Une panne fournisseur et un doublon de job ne créent pas de transcript fictif ou de passages en double ; « Réessayer » relance le traitement.
- **CA-4** — Un autre utilisateur ne peut lire l'audio, le transcript ou obtenir d'URL signée ; une source supprimée n'est plus lisible.
- **CA-5** — SCR-06 conserve sa structure, passe axe et les tests visuels desktop/mobile ; au moins une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `audio.test.ts`, `describe('[SPEC-901] audio transcription')` : formats, taille, durée, segments, ordre, libellé mm:ss, repli en cas d'erreur (CA-1, CA-2, CA-3).
- **Intégration** — `audio.test.ts` dans `test/integration`, `describe('[SPEC-901] audio ingestion')` : upload signé, job mock, passages/embeddings, double événement, panne/réessai, RLS et suppression (CA-1–CA-4).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-901.spec.ts`, `test('importe et lit une note vocale @SPEC-901')` : déposer fixture, attendre Prêt, ouvrir cours/citation à 00:42, lire puis supprimer ; vidéo (CA-1, CA-2, CA-4).
- **Visuel** — `test('apport audio conforme @SPEC-901 @visual')` : région dépôt et carte comparées à SCR-06, lecteur à jetons, axe, captures desktop/mobile à 1 % (CA-5).
- **Non-régression** — tests SPEC-206, 509, 607, 609 et sécurité SPEC-805.

| Critère | Tests |
|---|---|
| CA-1 | unitaires limites ; intégration upload ; e2e |
| CA-2 | unitaires segments ; intégration chunks ; e2e lecteur |
| CA-3 | intégration panne/doublon |
| CA-4 | intégration RLS/suppression ; e2e |
| CA-5 | e2e `@SPEC-901 @visual` |

## 13. Preuves attendues

`evidence/SPEC-901/` contient rapports, fixture et compte des segments sans contenu personnel, état de l'apport, capture du lecteur à 00:42, diff SCR-06, vidéo, `checks.json` et `acceptance.md`. Les appels Deepgram live ne sont pas requis par les tests automatisés et ne sont jamais déclarés exécutés en mode mock.

## 14. Définition de terminé

La définition de `docs/engineering/testing.md` §7 passe. Les limites ADR-0205 sont imposées côté serveur, l'isolation privée est démontrée, le cours ouvre la bonne seconde et les formats V1 restent inchangés. Aucune clé fournisseur n'est envoyée au navigateur.

## 15. Décisions et hypothèses

ADR-0008 fixe la disponibilité en V2 ; ADR-0205 fixe formats, limites et ancrage temporel. Les citations audio historiques reprennent la règle de source supprimée de BR-APP-10. Le mode mock déterministe est obligatoire en CI conformément à ADR-0048.
