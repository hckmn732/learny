# 11 — Sécurité, fiabilité et observabilité

## Authentification et isolation

- Résoudre cookie/Bearer en ActorContext; user_id du body n’est jamais identité.
- Vérifier signature/issuer/audience/expiry JWT via Supabase JWKS, cache et rotation; état frais pour suppression/changement credentials.
- Mutations cookie CSRF/origin guard; CORS allowlist stricte et credentials limités.
- RLS activée/forcée sur données user-owned; absence de claims = deny. Claims transaction-local, pool connection reset testé.
- Chaque écriture vérifie owner/tenant. Membres de groupe lisent programme partagé, pas ressources/notes/tentatives privées.
- Service role isolé et whitelisté; ne pas laisser une requête client l’utiliser directement.

## Entrées, fichiers, abus

- Limiter taille, profondeur JSON, MIME réel, archives, OCR/parser CPU/mémoire/temps.
- Défendre SSRF et rebinding DNS pour fetch URL, redirects et IP privées; contrôler egress.
- Rate limit par actor/route/IP signée, credential et fournisseur; limites upload.
- Secrets dans gestionnaire; BYOK chiffrée avec rotation; jamais plaintext en logs.
- Stripe raw-body signature, event ID unique, timestamp, replay protection; mêmes règles pour futurs webhooks sortants.
- HSTS/CSP/header web séparés du hardening API.
- Redaction PII dans prompt, traces et erreurs; rétention/sampling documentés.
- Audit trail pour clés providers, group access, export/delete et automation approval/undo.

## Fiabilité

Outbox avec événement atomique dans transaction métier. Dispatcher utilise leases/locking, backoff, compteur, failed queue, replay surveillé. Consumers idempotents; timeout/retries par type; opérations externes hors transaction DB. Compensation après effet externe partiel.

Shutdown API: ne plus accepter, drainer requêtes puis fermer pools. Worker: arrêter polling et ack après résultat durable. Déconnexion tutorat enregistre run incomplet/relançable.

## Observabilité

- Logs structurés: timestamp, severity, service/version/env, request_id, trace_id, route template, actor opaque, status, duration, error code.
- OpenTelemetry HTTP→use case→SQL→event dispatcher→worker→provider; pas de prompt contenu par défaut.
- Metrics API latency/error/RPS, pool active/wait/query, RLS rejection, queue depth/age/retry/failure, SSE active/first-token/disconnect, LLM spend/token/latency by provider/model/task, ingestion and retrieval recall.
- Metrics métier minimalistes: génération cours, quiz submitted, notification delivery, suppression lag.
- Liveness vérifie process; readiness DB/broker avec timeout; sondes séparées API et worker.
- Alertes: SLO burn, âge queue, DLQ, spend, tick manquant, invalid JWT/JWKS, saturation pool.

## RGPD

Pour chaque bounded context inventorier finalité, base légale, rétention, export, suppression et sous-traitant. Exporter conversations/resources, learning state, preferences et membership selon droits. Suppression asynchrone idempotente couvre DB, Storage, embeddings, credentials, logs/audit selon rétention applicable. Référencer registre existant et ADR-0045. Toute promesse de délai nécessite validation juridique et vérification des systèmes tiers.
