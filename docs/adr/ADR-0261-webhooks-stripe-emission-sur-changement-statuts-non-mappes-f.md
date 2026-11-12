# ADR-0261 — Webhooks Stripe: emission sur changement, statuts non mappes, faux client partage

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-210, ADR-0215

## Contexte

SPEC-210 applique les webhooks Stripe (ADR-0215). Trois points ne sont pas tranches : quand emettre billing/subscription-changed, que faire d'un statut Stripe absent de la table de correspondance, et comment le faux client en memoire est partage entre les bundles de routes Next.js.

## Décision

billing/subscription-changed n'est emis que lorsque le statut change (une reconduction active vers active n'emet rien) ; billing/payment-failed l'est pour chaque invoice.payment_failed applique. Le statut Stripe paused est lu comme past_due et tout statut inconnu comme incomplete (aucun droit : echec ferme), avec un avertissement journalise. Le faux client (STRIPE_MODE=mock) garde son etat dans un objet partage par globalThis ; ses compteurs cus_mock_n, sub_mock_n et evt_mock_n repartent apres le maximum present en base pour ne pas heurter les contraintes d'unicite apres un redemarrage. Le webhook simule est remis en processus a handleWebhook avec une signature reelle (cle STRIPE_WEBHOOK_SECRET, sinon cle generee par processus).

## Conséquences

Aucune conséquence particulière au-delà de la décision.
