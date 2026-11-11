# ADR-0053 — Docker : développement et auto-hébergement

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-008, SPEC-012

## Contexte

Question posée par le porteur du projet.

## Décision

V1 en production sur services gérés (Vercel, Supabase Cloud, Inngest Cloud). Docker sert au développement local (Supabase CLI, Inngest Dev Server, Mailpit) et à l'auto-hébergement : images `web` (Next.js standalone) et `worker`, `docker/compose.selfhost.yml` avec Supabase auto-hébergé et Inngest auto-hébergé.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
