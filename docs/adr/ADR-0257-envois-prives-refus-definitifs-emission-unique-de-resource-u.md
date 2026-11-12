# ADR-0257 — Envois privés : refus définitifs, émission unique de resource/uploaded et suppression qui conserve les citations

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-206, SPEC-104, SPEC-203, SPEC-607, ADR-0039, ADR-0122

## Contexte

EF-2 impose une finalisation idempotente et un événement émis une seule fois (CL-4) ; EF-5 et ET-6 imposent une suppression transactionnelle côté base qui conserve les citations, avec un nettoyage Storage repris en cas d'échec. Le rôle authenticated ne peut pas supprimer de passages (aucune politique DELETE sur resource_chunks) et l'outbox transactionnelle de SPEC-203 (ADR-0122) n'est pas encore livrée.

## Décision

Finalisation : un type, une taille, un nombre de pages ou un quota refusé écarte l'envoi (suppression logique, blob retiré, place libérée) ; un objet absent ou tronqué (UPLOAD_INCOMPLETE, code ajouté au catalogue) laisse la réservation intacte pour terminer l'envoi ; une taille réelle supérieure à l'annonce est mesurée et contrôlée, pas refusée d'office. La transition est sérialisée par le verrou utilisateur et select for update ; un appel répété renvoie le même état et compare l'etag courant à l'empreinte (CONFLICT si l'objet a changé). L'événement est revendiqué par mise à jour conditionnelle (eventClaimedAt, reprise après 60 s), envoyé après commit avec l'identifiant stable resource-uploaded:<id>, puis marqué (eventEmittedAt) ; un échec d'envoi libère la revendication et renvoie SERVICE_UNAVAILABLE, de sorte qu'un nouvel appel l'émette. L'adaptateur web envoie directement à Inngest en attendant l'outbox de SPEC-203 et ne fait rien en JOBS_MODE=inline. Suppression : une transaction en rôle propriétaire (vérification préalable de l'appartenance sous RLS) marque deleted_at (les triggers de SPEC-104 effacent le contenu et les passages ; la clé étrangère met chunk_id à null) et renomme le libellé des citations en « source supprimée » en conservant citation, extrait et emplacement ; le blob est retiré ensuite et marqué blobRemovedAt, sinon purgeDeletedBlobs (fonction idempotente destinée à un job de SPEC-203) ou une nouvelle suppression reprend le nettoyage. Les notes, pages web et vidéos YouTube créées par POST /chapters/:cid/resources restent en file sans événement : leur émission relève de SPEC-607 ET-4 via l'outbox.

## Conséquences

Une ressource refusée à la finalisation reste en base supprimée logiquement (nettoyage nocturne éventuel hors périmètre). Les codes d'erreur UNSUPPORTED_TYPE, QUOTA_EXCEEDED et UPLOAD_INCOMPLETE sont ajoutés à packages/core/src/errors.ts avec un statut 422. Le lien serviceDb de la suppression est limité à cette transaction (owner_id vérifié dans chaque requête).
