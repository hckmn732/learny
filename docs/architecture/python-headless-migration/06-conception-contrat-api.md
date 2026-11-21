# 06 — Conception du contrat API headless

## Source de vérité et transition

Le dépôt déclare actuellement 219 routes par schemas Zod/TypeScript et sert OpenAPI 3.1 dans apps/api/openapi.json. La cible remplace le registre TS comme auteur principal par un document OpenAPI versionné et contrôlé en CI. Durant migration, exporter le contrat et générer le client TS; ne pas entretenir manuellement des schémas Pydantic et TS séparés.

OpenAPI ne couvre pas toujours l’enveloppe SSE, events de jobs, contraintes métier, ou politiques d’idempotence. Ces contrats doivent être décrits et testés avec des schémas JSON versionnés.

## REST /api/v1

- Ressources nommées; verbes HTTP reflètent lecture, création, mise à jour ou commande métier.
- Cursor pagination pour collections volatiles, limite par défaut et maximale explicites.
- Filtre/tri allowlistés, pas de SQL brut fourni par client.
- Input/output validés; 204 uniquement sans représentation.
- Erreur RFC 9457 application/problem+json, code stable, requestId, erreurs de champ sans données sensibles.
- X-Request-Id au format limité; génération serveur si absent et propagation.
- Idempotency-Key pour mutations rejouables, scope actor + route, hash payload, TTL documenté, réponse rejouée; conflit si payload différent.
- ETag/If-Match uniquement pour modifications concurrentes qui en ont besoin; 409 si version échoue.
- Rate limit actor/tenant/credential et fournisseur; Retry-After.
- /api/v1 reste compatible en ajout; déprécier avant retrait; version majeure seulement si rupture justifiée.
- Regrouper des routes actuelles en ressources plus cohérentes uniquement après tableau de compatibilité.

## OpenAPI et SDK

OpenAPI 3.1 devient artefact de référence commité et linté. CI vérifie génération stable, diff breaking, examples, erreur/security scopes, pagination, webhooks. Généner SDK TypeScript; optionnellement client Python. Consumer contract tests web et simulateur natif. Fixer par tests nullability, enums, dates, unions, propriétés supplémentaires, numériques, erreurs.

SSE et MCP ont leurs propres contrats tests mais réutilisent DTO et use cases. Events de jobs demeurent un registre JSON Schema/versionné; OpenAPI seul ne décrit pas l’outbox.

## Authentification et autorisation

- Web temporaire: cookie Supabase relayé en same-origin; CSRF via origin guard sur mutations cookie.
- Clients natifs/externes: Authorization Bearer, scopes minimaux, token stocké de façon sécurisée, expiration/rotation gérées par client.
- Vérifier signature JWT, issuer, audience, expiry et rotation de clés. Revalider l’état compte pour suppression/changement d’identifiants.
- API keys uniquement si vrai cas confirmé; stocker hash, scopes, tenant, échéance, rotation et audit. Ne pas les traiter comme un utilisateur.
- OIDC/OAuth2 demeure une extension future, pas un identity server à réécrire.
- Actor tenant/scope transmis au UoW et aux règles. L’accès partagé en lecture au programme ne donne pas accès aux ressources, tentatives ou notes privées.

## SSE

Le tutorat utilise POST avec body et réponse text/event-stream, protocole UI Vercel AI; inventorier les types exacts et terminaux avant conversion. REST OpenAPI ne le décrit pas entièrement.

Garder SSE pour réponse unidirectionnelle, pas WebSocket. Ajouter un event ID ordonné et run/conversation ID. Reconnexion avec Last-Event-ID seulement si le flux est persisté; sinon reprendre/créer run avec idempotency token. Respecter cancellation, backpressure, proxy buffering, heartbeat et timeout. Autoriser conversation avant stream. Une interruption ne laisse pas un message final faussement complet.

## Webhooks

Stripe: raw-body signature, tolérance timestamp, event ID unique/idempotence. Réponse rapide après persistance outbox; consommation différée. Redelivery ne recrée pas entitlement. Webhooks sortants futurs: signature, timestamp, clé stable et budget de retries.

## MCP

Adaptateur séparé avec outils par scope/role. Appelle les use cases directement, sans HTTP interne. Limiter taille/temps/quotas; journal d’audit; filtrer PII; valider tous les arguments. Les outils de mutation attendent confirmation produit et permissions. MCP n’est pas l’API publique principale.

## Écart constaté dans le contrat publié

Le registry compte 219 routes et le document apps/api/openapi.json contient 217 opérations. Cet audit n’établit pas l’origine de l’écart. Tant qu’il n’est pas expliqué, OpenAPI ne peut pas être déclaré comme couverture exacte de l’API. Rapprocher chaque route du handler spécial/stream et du document généré; voir l’annexe 02b.
