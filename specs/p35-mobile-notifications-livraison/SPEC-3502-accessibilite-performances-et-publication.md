---
id: SPEC-3502
title: Accessibilité, performances et publication sur les stores
phase: P35
priority: mobile
depends_on: [SPEC-3203, SPEC-3303, SPEC-3304, SPEC-3305, SPEC-3402, SPEC-3501]
business_rules: [BR-PLA-02, BR-PLA-03, BR-PLA-04, BR-PLA-05, BR-PLA-07]
screens: []
adrs: [ADR-0041, ADR-3003, ADR-3004, ADR-3006, ADR-3007]
visual: demo
---

# SPEC-3502 — Accessibilité, performances et publication sur les stores

## 1. Objectif

Rendre l'application publiable : audit d'accessibilité sur appareil (VoiceOver, TalkBack, texte
agrandi), budgets de performance mesurés, parcours de bout en bout complet sur iOS et Android,
builds de production signés, fiches de confidentialité et diffusion en test interne
(TestFlight, Google Play test interne).

## 2. Contexte

Lire ADR-0041 (budgets de performance, transposés ici au mobile), ADR-3003 (comparaison
visuelle), ADR-3004 §8 (EAS Build, Submit, Update), ADR-3006 (règles des stores), ADR-3007
(sous-traitants des notifications), SPEC-803 et SPEC-804 (accessibilité et performances du web)
et SPEC-806 (pages légales, registre des traitements). Toutes les spécifications P30 à P35
précédentes sont terminées.

## 3. Dépendances

- **SPEC-3203, SPEC-3303, SPEC-3304, SPEC-3305, SPEC-3402, SPEC-3501** (et, par transitivité,
  toute la piste).
- Comptes Apple Developer et Google Play Console, projet EAS : fournis par le porteur. Sans eux,
  builds de production locaux et dossiers de fiches complets, puis
  `fail.mjs SPEC-3502 "comptes des stores absents" --external` pour la diffusion.

## 4. Règles métier couvertes

- BR-PLA-02 — Contrôle automatisé des cibles tactiles sur tous les écrans (≥ 44 pt / 48 dp).
- BR-PLA-03 — Audit VoiceOver et TalkBack de chaque écran (ordre de lecture, libellés, rôles,
  états, annonces), texte agrandi à 200 % sans perte d'information, contrastes, réduction des
  animations ; aucune anomalie bloquante ouverte.
- BR-PLA-04 — Les données restent hébergées dans l'UE ; les seuls tiers techniques du mobile
  (Apple, Google pour les notifications et la connexion, Sentry si configuré en région UE) sont
  listés dans la fiche de confidentialité et le registre.
- BR-PLA-05 — Fiche App Store (étiquettes de confidentialité), manifeste de confidentialité iOS
  (`PrivacyInfo.xcprivacy`), formulaire Data Safety de Google Play, suppression du compte dans
  l'application (ADR-3006).
- BR-PLA-07 — Budgets mobiles mesurés sur appareils de référence (ET-1).

## 5. Exigences fonctionnelles

- **EF-1** — Parcours de bout en bout Maestro `SPEC-3502-parcours.yaml` sur Android et iOS :
  connexion → Aujourd'hui → cours → tuteur → quiz de validation → Réviser hors ligne → agenda
  (replanifier) → profil → déconnexion, avec vidéo.
- **EF-2** — Rapport d'audit `evidence/SPEC-3502/a11y.md` : écran par écran, VoiceOver et
  TalkBack, texte 200 %, réduction des animations, anomalies et corrections (commits liés).
- **EF-3** — Builds `production` EAS (Android AAB, iOS IPA) signés ; `runtimeVersion` par empreinte ;
  canal EAS Update `production` vide au départ.
- **EF-4** — Fiches des stores dans `apps/mobile/store/` : textes (français), captures générées
  par Maestro aux formats requis (iPhone 6,9 et 6,5 pouces, Android téléphone), icône, politique de
  confidentialité (lien `/legal/confidentialite`), catégorie Éducation, classification d'âge.
- **EF-5** — Diffusion : TestFlight (testeurs internes) et Google Play test interne via
  `eas submit` ; numéros de build consignés.
- **EF-6** — Écran « À propos » dans Profil : version, build, licences des polices et
  bibliothèques (fichier généré).

## 6. Exigences techniques

- **ET-1** — Budgets (appareils de référence : Pixel 6a ou émulateur équivalent profil
  « milieu de gamme », iPhone 13 ou simulateur) : démarrage à froid jusqu'à Aujourd'hui affiché
  avec données en cache < 2,5 s (p75 de 10 mesures) ; défilement des écrans principaux sans
  image perdue au-delà de 1 % (outil de performance de React Native / Perfetto) ; réponse à un
  appui < 100 ms ; taille de téléchargement < 40 Mo par plateforme. Mesures consignées dans
  `evidence/SPEC-3502/perf.md`.
- **ET-2** — Contrôle automatisé des cibles et des libellés : test Jest qui parcourt l'arbre de
  chaque écran rendu avec les données de démonstration et vérifie libellés des boutons d'icône,
  rôles et tailles.
- **ET-3** — `PrivacyInfo.xcprivacy` déclare les API à raison requise utilisées (stockage,
  horloge système…) ; aucune collecte publicitaire ni de suivi.
- **ET-4** — Sentry (si activé) : région UE, aucun contenu utilisateur ni jeton dans les
  événements.

## 7. Comportements attendus et cas limites

- **CL-1** — Budget dépassé : correction (mémoïsation, virtualisation, chargement différé) avant
  de valider ; aucun budget assoupli sans ADR.
- **CL-2** — Anomalie d'accessibilité non corrigeable dans le délai : bloquante, la spécification
  reste en cours.
- **CL-3** — Rejet par une revue de store : motif consigné, correction, nouvelle soumission ;
  rejet hors de contrôle (compte, juridique) → blocage `--external`.

## 8. Instructions d'implémentation

1. Contrôle automatisé des cibles et libellés, puis audit manuel guidé par le contrôle.
2. Mesures de performance, optimisations, nouvelles mesures.
3. Parcours de bout en bout sur les deux plateformes.
4. Configuration de production EAS, fiches, captures, manifeste et Data Safety.
5. Soumission en test interne.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/store/**`, `apps/mobile/ios/PrivacyInfo.xcprivacy` (via plugin de
  configuration), `apps/mobile/test/a11y/screens.test.tsx`, `apps/mobile/e2e/flows/SPEC-3502-*.yaml`,
  `apps/mobile/app/(app)/profil/a-propos.tsx`.
- **Modifiés** — `apps/mobile/eas.json`, `apps/mobile/app.config.ts`, composants corrigés par
  l'audit, `docs/architecture/mobile/README.md` (procédure de publication).
- **Lus** — SPEC-803, SPEC-804, SPEC-806, ADR-0041.

## 10. Interface et conformité visuelle

Mode `demo` : page `/_dev/sdd/SPEC-3502` (builds de test) récapitulant budgets mesurés, résultat
de l'audit et numéros de build ; capture comparée à sa ligne de base. Non-régression visuelle :
tous les flux `@visual` des spécifications P31 à P35 rejoués sur iOS et Android (écart ≤ 12 %).

## 11. Critères d'acceptation

- **CA-1** — Le parcours de bout en bout passe sur Android et iOS avec vidéo.
- **CA-2** — Le contrôle automatisé des cibles et libellés passe sur tous les écrans ; l'audit
  manuel ne laisse aucune anomalie bloquante.
- **CA-3** — Les budgets d'ET-1 sont mesurés et respectés.
- **CA-4** — Les builds de production signés existent et sont disponibles en TestFlight et en test
  interne Google Play (ou blocage `--external` consigné avec les dossiers complets).
- **CA-5** — Manifeste de confidentialité, étiquettes App Store et Data Safety décrivent
  exactement les données traitées, revus contre le registre des traitements.

## 12. Plan de tests

- **Unitaires** — Jest `[SPEC-3502]` `test/a11y/screens.test.tsx` (tous les écrans) ; Vitest
  `[SPEC-3502]` `store/metadata.test.ts` (longueurs, champs obligatoires, liens). Couvre CA-2, CA-5.
- **Intégration** — Vitest `[SPEC-3502]` `test/integration/release-config.int.test.ts` :
  configuration de production (identifiants, schéma, liens universels, permissions déclarées,
  absence de variables de test). Couvre CA-4, CA-5.
- **End-to-end** — Maestro `@SPEC-3502` (vidéo) : `SPEC-3502-parcours.yaml` Android et iOS ;
  `SPEC-3502-captures-store.yaml`. Couvre CA-1.
- **Visuel** — `@SPEC-3502 @visual` : page de démonstration et rejeu de tous les flux visuels de
  la piste. Couvre CA-1, CA-2.
- **Non-régression** — toutes les étiquettes `[SPEC-30xx]` à `[SPEC-35xx]`. CA-3 prouvé par
  `perf.md` (mesures brutes et commandes).

| Critère | Tests |
|---|---|
| CA-1 | SPEC-3502-parcours.yaml |
| CA-2 | a11y/screens.test, a11y.md |
| CA-3 | perf.md |
| CA-4 | release-config.int, numéros de build |
| CA-5 | metadata.test, release-config.int |

## 13. Preuves attendues

`evidence/SPEC-3502/` : `acceptance.md`, `a11y.md`, `perf.md` (mesures brutes, appareils,
commandes), vidéos du parcours sur les deux plateformes, captures des stores, numéros de build et
liens TestFlight / Play Console (sans secret).

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3502` vert ; CP-35 peut être lancé.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0041, ADR-3003, ADR-3004, ADR-3006, ADR-3007.
- La publication publique (production) est une décision du porteur après CP-35 ; cette
  spécification s'arrête au test interne.
