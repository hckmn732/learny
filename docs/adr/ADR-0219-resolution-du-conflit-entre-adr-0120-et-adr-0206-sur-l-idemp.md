# ADR-0219 — Resolution du conflit entre ADR-0120 et ADR-0206 sur l'idempotence

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-112, SPEC-201, SPEC-208

## Contexte

ADR-0120 (SPEC-201) et ADR-0206 (SPEC-112) decrivent tous deux l'empreinte des cles d'idempotence mais divergent : code HTTP d'une cle reutilisee avec un autre corps (422 contre 409), nom de colonne (request_hash contre request_digest), composition de l'empreinte (utilisateur inclus ou non) et specification qui cree la colonne (migration de SPEC-201 alors que SPEC-112, en phase P1, la cree deja).

## Décision

ADR-0120 fait foi ; ADR-0206 est remplacee. (1) Codes : cle reutilisee pour une autre route ou une autre empreinte -> 422 IDEMPOTENCY_KEY_REUSED ; traitement en cours -> 409 IDEMPOTENCY_IN_PROGRESS avec Retry-After: 1 ; termine -> rejeu avec Idempotent-Replayed: true. C'est la semantique du brouillon IETF draft-ietf-httpapi-idempotency-key-header (422 pour une charge differente, 409 pour une requete concurrente). (2) Colonne unique request_hash text not null ; le nom request_digest n'est pas utilise. (3) Empreinte : SHA-256 de methode + chemin du gabarit + JSON canonique des parametres + JSON canonique du corps ; l'utilisateur n'y figure pas car la cle est deja portee par pk(user_id, key). (4) SPEC-112 cree la table complete avec request_hash et completed_at timestamptz null ; SPEC-201 n'ajoute aucune migration sur cette table et verifie la presence des colonnes par un test de schema. (5) Reservation par insert on conflict do nothing, reponses 2xx et 4xx enregistrees, 5xx ou exception -> ligne supprimee, validite 24 h et purge horaire par SPEC-208 : inchanges.

## Conséquences

Mises a jour : statut d'ADR-0206, docs/architecture/data-model.md section 12, SPEC-112 (EF-3, ET-1, CL-3, section 15), SPEC-201 (ET-4, etape 3 des instructions, section 15), SPEC-208 (section 15), et catalogue (ADR-0219 ajoute aux specs 112 et 201).
