# ADR-0007 — Authentification par lien magique ou mot de passe

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-202, SPEC-601

## Contexte

Le porteur du projet a choisi ces deux méthodes.

## Décision

Supabase Auth avec `@supabase/ssr` (cookies). Lien magique valable 1 h, usage unique ; mot de passe ≥ 12 caractères ; confirmation d'e-mail obligatoire ; renvoi limité à un toutes les 60 s ; e-mails d'authentification envoyés via SMTP Resend (production) ou Mailpit (local).

## Conséquences

Pas de connexion sociale en V1.
