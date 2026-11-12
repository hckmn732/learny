# ADR-0256 — Envois privés : accès Storage au nom de l'utilisateur et lecture des octets réels

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-206, SPEC-114, SPEC-201, ADR-0058, ADR-0249, ADR-0057, ADR-0047

## Contexte

SPEC-114 fournit les signatures et la suppression mais ni la mesure d'un objet déjà envoyé ni un jeton d'accès Storage : le wrapper d'API de SPEC-201 ne transmet que l'identité vérifiée. La finalisation doit lire les octets réels (type, taille, pages) sous l'identité de l'apprenant pour que les politiques Storage restent la défense en profondeur, sans utiliser la clé service_role pour une opération utilisateur. Storage vérifie l'expiration des jetons avec l'heure réelle, alors que l'horloge applicative est figée en test (ADR-0047).

## Décision

Le service émet pour la durée d'un appel (60 s) un JWT HS256 role authenticated, sub = apprenant, signé avec SUPABASE_JWT_SECRET (déjà requis côté serveur par la signature d'envoi de SPEC-114) ; il n'est ni journalisé ni stocké. Un lecteur SupabaseObjectReader (GET /object/info/authenticated puis /object/authenticated, lecture en flux arrêtée un octet au-delà de la borne) mesure et lit l'objet ; la taille annoncée n'est jamais prise sur parole. Le type vient de la signature binaire (file-type, jamais l'extension ni le Content-Type), les pages PDF de unpdf (ADR-0057, document seulement ouvert, jamais rendu). Les jetons et la passerelle Storage utilisent l'horloge système réelle ; réservations et revendications utilisent l'horloge injectée. La création d'envoi, la lecture et la suppression passent par createUploadUrl, createReadUrl et deleteStoredObject de SPEC-114.

## Conséquences

Le décompte de pages repose sur /Count du catalogue tel que lu par PDF.js ; un fichier hostile falsifiant ce compteur reste borné par 50 Mo et par l'ingestion (SPEC-509). Le test e2e et le serveur de test reçoivent SUPABASE_JWT_SECRET depuis supabase status (playwright.config.ts, sans l'écrire dans les rapports).
