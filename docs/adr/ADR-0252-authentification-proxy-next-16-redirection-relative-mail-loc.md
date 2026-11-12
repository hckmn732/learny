# ADR-0252 — Authentification : proxy Next 16, redirection relative, mail local et rappel du lien

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-202

## Contexte

SPEC-202 prévoit un fichier middleware.ts, or Next 16 le renomme proxy.ts et un seul fichier existe déjà (garde des pages SDD de SPEC-006). Les liens des e-mails sont figés par les gabarits Supabase (SiteURL), donc ne peuvent pas porter le paramètre next. Le Mailpit du CLI Supabase reçoit déjà les e-mails locaux, et le client Go de GoTrue refuse l'authentification SMTP PLAIN sur une connexion non chiffrée, ce qui exclut le Mailpit de docker compose avec identifiants. Le client Supabase SSR pose un cookie code-verifier PKCE inutile avec le flux token_hash. L'hôte vu par Next derrière next start peut différer de celui du navigateur (localhost contre 127.0.0.1).

## Décision

La garde des pages et la session sont fusionnées dans apps/web/proxy.ts (garde SDD synchrone pour /_dev, garde de session asynchrone ailleurs, logique pure dans lib/route-guard.ts). Le paramètre next d'une connexion par lien voyage dans le cookie httpOnly lr-next (1 h), relu par le rappel. Le rappel répond par une redirection 302 à Location relative, résolue par le navigateur sur l'origine qu'il a utilisée. Les e-mails locaux restent dans le Mailpit du CLI (MAILPIT_URL, défaut 54324) sans bloc auth.email.smtp ; la production passe par Resend (SPEC-013). Les cookies code-verifier sont ignorés. La page d'accueil / reste publique pour un visiteur anonyme jusqu'à SPEC-601 (un connecté est redirigé vers /accueil). Les limites d'inscription et de connexion de la pile locale sont relevées à 1000 pour les tests. Les helpers de test vivent dans @learny/testing/auth et @learny/testing/supabase ; aucun client Supabase administrateur n'est nécessaire (finalize.ts utilise serviceDb).

## Conséquences

SPEC-208 branche setRateLimiter et setOriginGuard sans toucher aux routes ; SPEC-601 remplace la page / ; le gabarit des e-mails ne dépend pas de l'origine publique.
