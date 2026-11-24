# ADR-3002 — Périmètre V1 de l'application mobile : compagnon d'apprentissage

- **Statut** : Remplacée par ADR-4002 (2026-11-24) — précisait ADR-1004 et ADR-0005 pour la piste mobile
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-0005, ADR-1004, ADR-3001, ADR-3003, SPEC-3102

## Contexte

Le web compte vingt écrans (`docs/product/screens.md`). La maquette mobile
(`design/app-mobile/`) en propose neuf, centrés sur l'apprentissage du jour : connexion,
Aujourd'hui, Programme, Cours, tuteur, quiz de validation, quiz global (« Réviser »), Agenda,
Profil. Les parcours de configuration (onboarding, cadrage d'une formation, import d'apports,
groupes) sont longs, rares et mieux servis par un grand écran.

## Décision

1. **Dans le périmètre mobile V1** (équivalents web entre parenthèses) :
   - connexion, inscription, lien magique, acceptation des CGU (SCR-01) ;
   - Aujourd'hui (SCR-03), Programme en lecture avec modules et chapitres (SCR-05, SCR-06 en
     lecture), Agenda jour/semaine/mois et replanification (SCR-12) ;
   - Cours et discussion avec le tuteur (SCR-07) ;
   - quiz de validation, résultat et accès à la remédiation (SCR-09) ;
   - quiz global du jour et échauffement, jouables hors ligne (SCR-10, BR-PLA-01) ;
   - notifications in-app, profil, réglages (profil, rythme, notifications, choix des modèles
     d'IA), pause, statut d'abonnement, export et suppression du compte (SCR-15) ;
   - notifications push natives (P35).
2. **Hors périmètre mobile V1, renvoyé au web** : premiers pas (SCR-02), création et cadrage d'une
   formation (SCR-04), génération, import et ajustement du programme, ajout d'apports (SCR-06 en
   écriture), exercice pratique (SCR-08), examen blanc (SCR-11), lacunes (SCR-13), carte des
   notions (SCR-14), bilan final (SCR-16), formations à plusieurs (SCR-17), recherche (SCR-18),
   saisie de clés d'IA personnelles, achat ou gestion de l'abonnement (ADR-3006).
3. Tout point d'entrée vers un élément hors périmètre ouvre la page web correspondante dans le
   navigateur système (`expo-web-browser`), avec le libellé « Continuer sur le web ». Un compte
   dont l'onboarding n'est pas terminé (`GET /me/onboarding`) voit l'écran « Terminez votre
   configuration sur le web » (SPEC-3102).
4. Les libellés repris du web sont copiés à l'identique depuis `@learny/i18n` ; les libellés
   propres au mobile sont ajoutés dans `@learny/i18n` sous l'espace `mobile` (ajout
   rétrocompatible, ADR-3005).

## Conséquences

- Aucune règle métier n'est modifiée ; les règles des écrans hors périmètre restent couvertes par
  le web.
- Le périmètre pourra être étendu par un ADR ultérieur de la piste mobile.
