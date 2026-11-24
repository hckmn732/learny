# ADR-3006 — Règles des stores : abonnement, suppression du compte et connexion tierce

- **Statut** : Acceptée
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-0007, ADR-0215, ADR-0340, ADR-3002, ADR-3008, SPEC-3401, SPEC-3402, SPEC-3502

## Contexte

L'abonnement est vendu par Stripe Checkout (ADR-0215, SPEC-210, SPEC-725). Les règles de l'App
Store imposent l'achat intégré pour un abonnement numérique acheté dans une application iOS
(règle 3.1.1) et la suppression du compte dans l'application dès lors qu'on peut y créer un
compte (règle 5.1.1(v)) ; elles imposent « Se connecter avec Apple » si un autre fournisseur de
connexion tiers est proposé (règle 4.8). Google Play a des règles analogues sur la facturation et
sur la suppression du compte. Le droit d'usage gratuit existe par défaut (ADR-0340).

## Décision

1. **Abonnement** : l'application (iOS et Android, pour une seule logique) affiche le statut et la
   date de fin de période (`GET /billing/subscription`) ; elle ne propose **ni achat, ni lien
   vers un achat externe, ni prix**. `POST /billing/checkout` et `POST /billing/portal` ne sont
   jamais appelés depuis le mobile. L'achat intégré est hors périmètre V1.
2. **Suppression du compte** : disponible dans Profil → Confidentialité (`POST /me/deletion`,
   annulation `DELETE /me/deletion`), avec la même confirmation et le même délai que le web
   (SPEC-211).
3. **Connexion tierce** : Google n'est proposé qu'avec Apple, sur les deux plateformes
   (SPEC-3402). Tant que SPEC-3402 n'est pas terminée, seuls mot de passe et lien magique sont
   proposés.
4. Les fiches des stores (confidentialité, Data Safety, manifeste de confidentialité iOS)
   décrivent les données réellement traitées (SPEC-3502).

## Conséquences

- La ligne « Abonnement » de la maquette (Profil) n'a pas de bouton d'action.
