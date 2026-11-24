# Formulaire Data safety Google Play (Learny 1.0.0)

Réponses du formulaire « Sécurité des données » de la Play Console (SPEC-3502 EF-4, CA-5 ;
BR-PLA-04, BR-PLA-05). Elles décrivent les mêmes données que `store/metadata.ts`
(`PRIVACY_DATA_USES`) et que les étiquettes App Store (`privacy/app-store.md`).

## Collecte et partage

| Question | Réponse |
|---|---|
| L'application collecte-t-elle ou partage-t-elle des données ? | **Oui**, collecte uniquement |
| Les données sont-elles chiffrées en transit ? | **Oui** (HTTPS, TLS) |
| L'utilisateur peut-il demander la suppression ? | **Oui**, dans l'application (Profil → Données et confidentialité) et par la page légale |
| Les données sont-elles utilisées pour le suivi publicitaire ? | **Non** |
| Les données sont-elles vendues ? | **Non** |

## Types de données

| Catégorie Play | Donnée | Collectée | Partagée | Finalité | Facultative |
|---|---|---|---|---|---|
| Informations personnelles | Adresse e-mail | oui | non | Fonctionnalité de l'application | non (compte) |
| Informations personnelles | Nom | oui | non | Fonctionnalité de l'application | non |
| Contenu généré par l'utilisateur | Autres contenus (cours importés, questions) | oui | oui (fournisseur de modèle d'IA choisi) | Fonctionnalité de l'application | non |
| Activité dans l'application | Interactions avec l'application | oui | non | Fonctionnalité de l'application | non |
| Identifiants d'appareil | Jeton de notification (FCM) | oui | oui (Google, Apple) | Fonctionnalité de l'application | non |
| Diagnostics | — | non | non | — | — |
| Localisation | — | non | non | — | — |
| Contacts, calendrier, SMS, santé | — | non | non | — | — |

## Justifications pour la revue

- **Notifications** : la permission `POST_NOTIFICATIONS` sert uniquement aux rappels de révision que
  l'apprenant active lui-même (ADR-3007, SPEC-3501). Le jeton natif est supprimé à la désinscription
  et à la suppression du compte.
- **Hébergement** : les données restent dans l'Union européenne (Supabase auto-hébergé, BR-PLA-04).
  Les seuls tiers techniques sont Apple et Google pour les notifications, et le fournisseur de
  modèle d'IA que l'apprenant configure lui-même.
- **Aucun suivi** : aucun SDK publicitaire, aucun identifiant publicitaire, aucune télémétrie
  (Sentry non configuré, ET-4).
- **Suppression du compte** : l'URL de suppression est celle de l'application elle-même ; Play
  demande aussi une page web, fournie par `/legal/confidentialite` (SPEC-806).

## Captures et fiche

Les captures téléphone sont dans `screenshots/android-phone/` (1080 × 2160, ratio 2:1, format
accepté par Play). Les captures iOS ne peuvent pas être produites sans macOS : blocage externe
consigné dans `evidence/SPEC-3502/acceptance.md`.
