# SPEC-206 — critères d'acceptation

Mesures du 2026-11-12 sur la pile Supabase locale (`pnpm dev:up`) : Storage réel (buckets privés de
SPEC-114, vrais octets envoyés par URL signée), Postgres réel avec ses politiques RLS et ses
déclencheurs de limites, identités `authenticated` réelles pour plusieurs utilisateurs. Horloge figée
ADR-0047 pour les réservations, horloge réelle pour les jetons Storage ; IA `LLM_MODE=mock`. Seul le
destinataire de l'événement `resource/uploaded` est un enregistreur. Preuves : `unit.json` (25 tests
`[SPEC-206]`), `integration.json` (28 tests `[SPEC-206]`), `e2e.json` et les vidéos de `video/`, et les
mesures écrites par les tests eux-mêmes dans `proofs/` (comptes, codes et tailles uniquement : aucune
URL signée, aucun jeton, aucun apport privé réel). Les maquettes n'ont pas été modifiées.

- ✅ **CA-1** — Les bornes exactes de BR-APP-02 sont appliquées au fichier réel et au texte, et les trois
  codes métier sont renvoyés correctement.
  Preuve : intégration `[SPEC-206] upload service › finalization` « accepts a 50 MB PDF of 500 pages and
  refuses 501 pages » (PDF de 52 428 800 octets et 500 pages envoyé à Storage puis accepté ; 501 pages →
  `UPLOAD_TOO_LARGE` « Un PDF ne peut pas dépasser 500 pages. », blob retiré, place libérée), « accepts a
  10 MB image and refuses one measured beyond it » (image de 10 485 760 octets acceptée ; 10 Mo + 1 octet
  annoncé à 1 Mo → `UPLOAD_TOO_LARGE`), « refuses an executable named .png » (`UNSUPPORTED_TYPE`, objet
  supprimé), « creates a note of 100 000 characters, refuses 100 001 » (`UPLOAD_TOO_LARGE`, jamais prêt),
  « refuses the 101st contribution of a chapter » et « counts live reservations in the 2 GB quota, to the
  exact byte » (`QUOTA_EXCEEDED`, aucune URL d'envoi), « refuses a declared type or size » (vidéo, audio,
  ZIP → `UNSUPPORTED_TYPE` ; 50 Mo + 1 et 10 Mo + 1 → `UPLOAD_TOO_LARGE`, aucune ligne créée). Unitaires
  `[SPEC-206] upload limits` : mêmes bornes sur octets réels (PDF de 50 Mo et 500 pages construit, 501
  pages, signatures PNG/JPEG/WebP/HEIC, GIF et texte refusés, PDF endommagé refusé, 100 000 caractères en
  points de code). Mesures : `proofs/bounds.json`. E2E `@SPEC-206` : la table de la page affiche
  `UPLOAD_TOO_LARGE`, `UNSUPPORTED_TYPE` et `QUOTA_EXCEEDED` renvoyés par le service ; la route réelle
  répond 422 `application/problem+json` avec `UNSUPPORTED_TYPE` (vidéo) et `UPLOAD_TOO_LARGE` (PDF de 60 Mo).
- ✅ **CA-2** — Deux finalisations ou créations concurrentes ne doublent ni quota ni événement et ne
  dépassent pas 100 apports / 2 Go.
  Preuve : intégration « never lets two simultaneous creations pass a chapter at 99 contributions » (trois
  créations simultanées : `OK`, `QUOTA_EXCEEDED`, `QUOTA_EXCEEDED` ; 100 lignes dans le chapitre), « counts
  live reservations in the 2 GB quota … under concurrency » (deux réservations simultanées de 30 Mo avec
  48 Mo disponibles : une seule passe ; volume compté 2 128 609 280 octets ≤ 2 147 483 648), « counts a
  finalization once when two arrive together » (trois finalisations simultanées : un seul état, une seule
  ressource comptée, un événement `resource-uploaded:<id>`), « runs two simultaneous creations with one key
  as a single reservation », « frees the room of an expired reservation » (ET-3, horloge avancée de 10 min
  1 s) et « sends the event again after a failed send, and still only once overall ». Mesures :
  `proofs/concurrency.json`.
- ✅ **CA-3** — Un membre du même groupe ne lit ni n'efface l'apport d'autrui ; l'URL de lecture expire
  après dix minutes.
  Preuve : intégration « keeps a group member out of another member's contribution » (membre du groupe et
  tiers : lecture, finalisation et suppression → `FORBIDDEN` ; `SELECT` sous RLS du membre sur la
  ressource : 0 ligne ; apport et blob du propriétaire intacts) et « signs a ten-minute read URL for the
  owner and a new one at each call » (`expiresAt` à +10 min de l'horloge injectée, durée du jeton signé
  600 s, octets téléchargés identiques ; une URL demandée 11 min plus tard est une nouvelle signature, la
  première n'est jamais prolongée). Mesures : `proofs/isolation.json`, `proofs/read-url.json`. E2E
  `@SPEC-206` : sur les routes réelles, un second utilisateur reçoit 403 `FORBIDDEN` en lecture, en
  finalisation et en suppression ; un identifiant inconnu → 404.
- ✅ **CA-4** — La suppression retire passages et blob, laisse les citations « source supprimée » et est
  idempotente.
  Preuve : intégration « removes blob and passages, keeps the citations « source supprimée », and is
  idempotent » (avant : citation liée à son passage, libellé « Guide FI, p. 4 » ; après : `chunk_id` nul,
  libellé « source supprimée », extrait et emplacement conservés, 0 passage, blob absent de Storage ;
  seconde suppression = succès ; lecture et finalisation → `NOT_FOUND` ; place rendue au quota et au
  chapitre), « revokes access at once when Storage fails, then resumes the cleanup without loss » (CL-8 :
  accès révoqué immédiatement, blob encore présent, `purgeDeletedBlobs` échoue 1 puis réussit 1, puis 0 :
  idempotent) et « resumes the cleanup when the deletion is simply repeated ». Mesures :
  `proofs/citations-after-deletion.json`. E2E `@SPEC-206` : sur les routes réelles, `DELETE` répond 204
  deux fois puis la lecture répond 404.
- ✅ **CA-5** — La page SDD montre limites, erreurs et suppression, passe axe, vidéo et captures
  desktop/mobile.
  Preuve : e2e `@SPEC-206` « inspecte les limites d'envoi » (titre H1, sections `spec-206-limits`,
  `spec-206-cases`, `spec-206-deletion` dans l'ordre, quatre cartes de limites, les huit essais avec leurs
  codes, activation au clavier, exemple « source supprimée », axe sans violation serious/critical, aucune
  erreur de console) et « envois conformes @visual @mobile » (jetons #F4F4F1 / #FFFFFF / #E7E6E1 / 24 px,
  polices, pas de défilement horizontal, captures `spec-206-demo-desktop-linux.png` et
  `spec-206-demo-mobile-linux.png`, écart ≤ 1 %). Parcours réel sans navigateur : « parcourt les routes
  réelles » (401 sans session, 400 sans clé, 201 avec URL signée sur `<userId>/<resourceId>/guide.pdf`,
  rejeu de la même clé → même ressource, aucune URL stockée par `idempotency_keys` ni par `resources`,
  envoi à Storage, finalisation 200 puis idempotente, lecture signée téléchargée octet pour octet, note
  201 en file). Vidéos : `video/`.
