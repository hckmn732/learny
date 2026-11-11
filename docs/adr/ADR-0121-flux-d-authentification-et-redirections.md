# ADR-0121 — Flux d'authentification et redirections

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-202, SPEC-601, SPEC-602, SPEC-211

## Contexte

ADR-0007 fixe les méthodes (lien magique, mot de passe) mais pas le mécanisme de vérification côté serveur, la protection contre l'énumération des comptes, le moment où l'acceptation des CGU est enregistrée, ni les règles de redirection.

## Décision

- Les liens des e-mails pointent vers `/api/v1/auth/callback?token_hash=…&type=…` ; le serveur appelle `verifyOtp` (flux `token_hash`, compatible rendu serveur et autre appareil) puis pose les cookies `@supabase/ssr`.
- Non-énumération : `magic-link` (connexion) et `sign-up` répondent à l'identique pour une adresse connue ou inconnue.
- L'acceptation des CGU/confidentialité (versions de `LEGAL_VERSIONS`), sa date et le fuseau détecté sont transmis en métadonnées d'inscription, puis écrits dans `legal_acceptances` et `profiles` à la **première vérification réussie** ; `user/signed-up` est émis à ce moment, une seule fois (identifiant d'événement `user-signed-up:<userId>`).
- Destination après authentification : suppression programmée → `/parametres#profil` ; étape d'onboarding `profil|rythme|ia` → `/premiers-pas/<étape>` ; sinon paramètre `next` relatif et sûr ; sinon `/accueil`.
- L'application devient accessible dès que l'onboarding atteint `rappels` (étape IA franchie, BR-ACC-04) ; le middleware mémorise ce fait dans le cookie httpOnly `lr-onboarded=<userId>`.
- La limite de renvoi de 60 s est appliquée par GoTrue (`max_frequency`) et traduite en `429 RESEND_TOO_SOON`.

## Conséquences

Les écrans SPEC-601/602 n'implémentent aucune logique de redirection propre ; SPEC-211 s'appuie sur la redirection des comptes en suppression programmée.
