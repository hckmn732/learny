# ADR-0255 — Protections de l'API : ordre des gardes, horloge des seaux, adresse du client

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-208

## Contexte

SPEC-208 active la limitation de débit et la vérification d'origine annoncées par SPEC-201. Le seau d'un utilisateur ne peut être clé qu'après l'authentification, alors que SPEC-201 plaçait la limitation avant. Le déclencheur générique set_updated_at réécrit updated_at avec now() à chaque mise à jour des seaux, ce qui contredit l'horloge injectable. Next ne donne pas l'adresse du socket et laisse passer un X-Forwarded-For fourni par le client. La colonne tokens a quatre décimales.

## Décision

Ordre : identifiant de requête, garde d'origine (avant tout jeton et toute lecture de corps), limitation par adresse pour une route publique, authentification, limitation par utilisateur pour une route protégée ; un appel anonyme à une route protégée reste un 401 sans jeton. Migration 0028 : le déclencheur set_updated_at est retiré de rate_limits, la requête de consommation écrit elle-même updated_at depuis l'horloge injectée, avec une tolérance de 0,0001 jeton liée à la précision de la colonne et un temps par jeton exact (0,5 s, 3 s, 6 s) plutôt qu'un débit fractionnaire. X-Forwarded-For n'est lu que si TRUST_PROXY=true (Vercel) ; sinon l'adresse est inconnue et les profils par adresse partagent le seau ip:unknown (fermeture sûre). L'origine de l'application est NEXT_PUBLIC_APP_URL, à défaut l'hôte et le protocole de la requête. ORIGIN_NOT_ALLOWED du catalogue devient ORIGIN_REJECTED (ADR-0213). La table des profils vit dans packages/contracts pour que la démonstration et le limiteur lisent les mêmes valeurs. Les e2e lancent le serveur avec TRUST_PROXY=true et chaque test annonce sa propre adresse (fixture clientAddress) ; les tests d'intégration font de même. Les routes de démonstration simulent sur des seaux synthétiques supprimés ensuite.

## Conséquences

Toute migration d'un worktree parallèle n'existe dans la base partagée qu'après db:reset ou supabase migration up depuis ce worktree. La production doit définir TRUST_PROXY=true derrière Vercel et RATE_LIMIT_IP_SECRET.
