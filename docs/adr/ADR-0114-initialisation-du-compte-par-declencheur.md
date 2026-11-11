# ADR-0114 — Initialisation du compte par déclencheur

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-102, consignée pour rendre le référentiel cohérent)
- **Date** : 2026-11-11
- **Liens** : SPEC-102, SPEC-202

## Contexte

L'inscription dans Supabase Auth doit produire un profil et ses préférences même si le navigateur se ferme avant l'onboarding. Une création uniquement côté client laisserait des utilisateurs Auth sans lignes de domaine.

## Décision

Un déclencheur `security definer` sur `auth.users` crée dans la même transaction les lignes de profil et de préférences décrites en SPEC-102 §5–§6. Il fixe explicitement son `search_path`, n'utilise que l'identifiant Auth et les métadonnées autorisées, applique les valeurs métier par défaut de `business-rules.md` et reste idempotent. Les noms des clés de `params` stockées en JSON sont en anglais et versionnés. Le déclencheur ne donne pas au client la capacité d'écrire dans les tables d'autrui ; les écritures ultérieures passent par les services avec RLS. Une erreur de création des valeurs obligatoires annule l'inscription plutôt que de produire un compte incomplet.

## Conséquences

SPEC-202 peut lire un profil complet dès la première session. Les tests d'intégration couvrent une inscription Auth et la présence des lignes, les valeurs par défaut et l'isolation entre deux utilisateurs.
