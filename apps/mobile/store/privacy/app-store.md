# Étiquettes de confidentialité App Store (Learny 1.0.0)

Déclaration « App Privacy » d'App Store Connect (SPEC-3502 EF-4, CA-5 ; BR-PLA-04, BR-PLA-05).
Elle décrit exactement les données du registre des traitements (SPEC-806) et du manifeste
`PrivacyInfo.xcprivacy` produit par `ios.privacyManifests` d'`app.config.ts` (ET-3).

**Suivi** : l'application ne suit pas l'apprenant. `NSPrivacyTracking = false`,
`NSPrivacyTrackingDomains = []`, aucun identifiant publicitaire, aucun SDK publicitaire.

| Donnée (libellé Apple) | Collectée | Liée à l'identité | Suivi | Finalité | Sous-traitant |
|---|---|---|---|---|---|
| Coordonnées — adresse e-mail | oui | oui | non | Fonctionnement de l'application | Supabase (UE) |
| Coordonnées — nom | oui | oui | non | Fonctionnement de l'application | Supabase (UE) |
| Contenu utilisateur — autres contenus | oui | oui | non | Fonctionnement de l'application | fournisseur de modèle d'IA choisi par l'apprenant |
| Activité — interaction avec le produit | oui | oui | non | Fonctionnement de l'application | aucun |
| Identifiants — identifiant d'appareil (jeton FCM/APNs) | oui | oui | non | Fonctionnement de l'application | Apple (APNs), Google (FCM) |
| Diagnostics | non | — | — | Sentry n'est pas configuré (ET-4) | — |
| Localisation | non | — | — | aucune permission de localisation | — |
| Contacts, santé, achats, navigation | non | — | — | hors périmètre V1 (ADR-3002) | — |

## Réponses aux questions de la revue

- **Suppression du compte** : disponible dans l'application, Profil → Données et confidentialité →
  Supprimer mon compte (règle 5.1.1(v), ADR-3006 § 2). Confirmation par saisie de `SUPPRIMER`,
  délai de 30 jours, annulation possible.
- **Connexion tierce** : « Se connecter avec Apple » est proposé avec Google (règle 4.8,
  SPEC-3402).
- **Achats** : aucun achat intégré, aucun lien vers un achat externe, aucun prix affiché
  (règle 3.1.1, ADR-3006 § 1). L'abonnement n'est pas vendu dans l'application.
- **Chiffrement** : `ITSAppUsesNonExemptEncryption = false` — HTTPS et Keychain du système
  uniquement.
- **API à raison requise** (`PrivacyInfo.xcprivacy`) : horodatage de fichiers (C617.1),
  `UserDefaults` (CA92.1), heure de démarrage système (35F9.1), espace disque (E174.1). Aucune de
  ces API ne sert à suivre l'apprenant.

## Mise à jour

Une nouvelle donnée traitée impose trois modifications dans le même lot : `store/metadata.ts`
(`PRIVACY_DATA_USES`), `app.config.ts` (`NSPrivacyCollectedDataTypes`) et ce tableau.
`test/integration/release-config.int.test.ts` vérifie que les deux premiers restent d'accord.
