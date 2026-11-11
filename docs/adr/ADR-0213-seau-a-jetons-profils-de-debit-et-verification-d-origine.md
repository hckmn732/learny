# ADR-0213 — Seau a jetons, profils de debit et verification d'origine

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-208

## Contexte

ADR-0042 impose un seau a jetons Postgres (rate_limits) et une verification d'origine des mutations ; docs/architecture/api.md fixe 120/min par utilisateur, 20/min pour l'IA et 10/min par IP pour l'authentification, sans preciser la capacite, la recharge, la cle des seaux ni la regle d'origine.

## Décision

Profils : default (capacite 120, recharge 2 jetons/s, cle user), ai (capacite 20, recharge 1 jeton/3 s, cle user), auth (capacite 10, recharge 1 jeton/6 s, cle ip), none (aucun controle). Cle de seau : user:<uuid>:<profil> ou ip:<hmac>:<profil>, ou <hmac> = 32 premiers caracteres hexadecimaux de HMAC-SHA256(RATE_LIMIT_IP_SECRET, ip) ; le seau est partage par toutes les routes d'un meme profil. Consommation atomique par une seule instruction SQL insert ... on conflict do update (recharge lineaire bornee a la capacite puis decrement si tokens >= 1), avec horloge injectee. Refus : 429 RATE_LIMITED, Retry-After = ceil((1 - tokens) / recharge) secondes, en-tetes RateLimit-Limit et RateLimit-Remaining sur toutes les reponses limitees. IP : premier element de X-Forwarded-For seulement si TRUST_PROXY=true, sinon adresse du socket. Panne de la base pendant la consommation : la requete est refusee 503 SERVICE_UNAVAILABLE (fermeture sure), jamais acceptee sans controle. Origine : toute methode autre que GET, HEAD, OPTIONS sur /api/v1 exige un en-tete Origin egal a l'origine de NEXT_PUBLIC_APP_URL ou presente dans ALLOWED_ORIGINS (liste separee par des virgules) ; a defaut d'Origin, Sec-Fetch-Site doit valoir same-origin ; sinon 403 ORIGIN_REJECTED. Exemptions : /api/v1/webhooks/* (signature propre), /api/inngest (signature Inngest), POST /api/v1/email/unsubscribe (RFC 8058, jeton HMAC). Purges horaires : idempotency_keys plus anciennes que 24 h et seaux rate_limits non modifies depuis 24 h.

## Conséquences

Nouvelles variables RATE_LIMIT_IP_SECRET, TRUST_PROXY et ALLOWED_ORIGINS dans .env.example et le schema SPEC-009 ; nouveaux codes ORIGIN_REJECTED et SERVICE_UNAVAILABLE dans le catalogue d'erreurs.
