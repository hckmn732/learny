---
id: SPEC-4003
title: Mode simple — parcours mobile iOS et Android « Dépose ton cours »
phase: P40
priority: mode-simple
depends_on: [SPEC-4001]
business_rules: [BR-FOR-04, BR-FOR-16, BR-APP-01, BR-APP-02, BR-APP-07, BR-IA-06, BR-PLA-03]
screens: [SCR-03, SCR-21, SCR-22, SCR-23, SCR-24]
adrs: [ADR-4002, ADR-4003, ADR-4009, ADR-3003, ADR-3004, ADR-3008, ADR-3014, ADR-3015]
visual: mockup
---

# SPEC-4003 — Mode simple : parcours mobile

## 1. Objectif

Livrer sur l'application mobile, iOS et Android, le même parcours que le web (SPEC-4002) : mêmes fonctionnalités, mêmes règles, même API, mêmes libellés (ADR-4002). Seule l'ergonomie native change :
- le sélecteur de fichiers et les photos de pages ;
- le partage vers Learny ;
- la notification push « Ton programme est prêt ».

## 2. Contexte

À lire :
- `design/mode-simple/index.html`, vue Mobile, iOS et Android, étapes 1 à 6 ;
- `docs/architecture/mobile/README.md` (canevas de la piste mobile) ;
- ADR-4002, qui remplace ADR-3002 : plus aucun renvoi « Continuer sur le web » pour ce parcours ;
- ADR-3014 (client API mobile et cache) ;
- ADR-3015 (outillage e2e Maestro) ;
- les écrans existants Aujourd'hui (SPEC-3201), Cours (SPEC-3302) et Quiz (SPEC-3304).

## 3. Dépendances

- **SPEC-4001** (`done`) : contrat du mode simple.
- Bibliothèques Expo, versions alignées sur le SDK du projet (ADR-3004) : `expo-document-picker`, `expo-image-picker`, `expo-file-system` (téléversement en arrière-plan reprenable) et `expo-sharing` (réception de fichiers partagés). Aucun service externe nouveau.
- Notifications push : si P35 (SPEC-3501) n'est pas `done`, la fin de l'analyse est signalée par la notification in-app seule, et la push est ajoutée par SPEC-3501.

## 4. Règles métier couvertes

Les mêmes que SPEC-4002, avec la même implémentation côté API :
- **BR-FOR-04, BR-FOR-16** ;
- **BR-APP-01, BR-APP-02, BR-APP-07** ;
- **BR-IA-06** : l'ajout de la clé ouvre l'écran Profil, section modèles (SPEC-3401), avec retour au dépôt ;
- **BR-PLA-03** : accessibilité (VoiceOver et TalkBack).

## 5. Exigences fonctionnelles

- **EF-1. Aujourd'hui.** Une section « Nouvelle formation » affiche les deux cartes empilées. « Dépose ton cours » ouvre le dépôt. « Construire avec le tuteur » ouvre le cadrage s'il est déjà rattrapé (ADR-4002 §3), sinon le renvoi transitoire « Continuer sur le web ».
- **EF-2. Dépôt.**
  - Trois boutons : « Fichiers » (sélecteur de documents, plusieurs fichiers), « Photos de pages » (appareil photo ou galerie, plusieurs images, chaque image devenant un document `image`) et « Lien ».
  - La liste, les rôles (« Rôle : … »), la motivation et « Créer ma formation » (bouton fixé en bas) se comportent comme sur le web (SPEC-4002 EF-2).
- **EF-3. Partager vers Learny.** Un PDF, un DOCX ou une image partagé depuis une autre application ouvre le dépôt avec ce fichier déjà ajouté. Si l'utilisateur n'est pas connecté, la connexion passe d'abord, puis le fichier est conservé.
- **EF-4. Sans clé d'IA.** L'encart, le blocage et le retour sont identiques au web (SPEC-4002 EF-3).
- **EF-5. Analyse.** Même contenu que le web. La mention devient « Tu peux fermer l'app : une notification te prévient quand c'est prêt. » La notification ouvre l'aperçu.
- **EF-6. Aperçu.** Indicateurs sur deux colonnes, bloc d'échéance avec un sélecteur de date natif, liste des modules (4 affichés, puis « + N autres modules »), boutons fixés en bas « C'est parti » et « Ajuster avec le tuteur ». « Ajuster » suit la même règle de transition que « Construire avec le tuteur ».
- **EF-7. Diagnostic.** Écran plein, croix de fermeture (qui équivaut à « Passer »), bouton « Passer », progression, et boutons fixés en bas « Valider » et « Je ne sais pas ».
- **EF-8. Résultat.** La ligne de score, le titre, la carte « Ton premier chapitre est prêt » (bouton « Commencer · n min » vers le cours existant) et la liste de préparation suivent la maquette mobile.

## 6. Exigences techniques

- **ET-1.** Routes expo-router :
  - `apps/mobile/app/formations/depot.tsx` ;
  - `apps/mobile/app/formations/[fid]/depot.tsx` ;
  - `apps/mobile/app/formations/[fid]/apercu.tsx` ;
  - `apps/mobile/app/formations/[fid]/diagnostic.tsx` ;
  - `apps/mobile/app/formations/[fid]/diagnostic/resultat.tsx`.

  Les composants vont dans `apps/mobile/src/simple/`.
- **ET-2.** Le téléversement passe par une tâche en arrière-plan qui reprend après une coupure réseau et ne relance pas les fichiers déjà confirmés. Au plus deux fichiers à la fois.
- **ET-3.** Partage :
  - Android : filtre d'intention `ACTION_SEND` et `ACTION_SEND_MULTIPLE`, types `application/pdf`, DOCX et `image/*` ;
  - iOS : déclaration des types de documents (`CFBundleDocumentTypes`) pour « Ouvrir avec Learny ».

  Configuration dans `app.config.ts`.
- **ET-4.** `testID` identiques aux `data-testid` web de SPEC-4002 ET-3 (parité vérifiable).
- **ET-5.** Libellés repris de `@learny/i18n` (espace `simple`). Les libellés propres au mobile (« Photos de pages », « Tu peux fermer l'app… ») vont dans l'espace `mobile` (ADR-3005).

## 7. Comportements attendus et cas limites

- **CL-1.** Permission appareil photo ou galerie refusée : explication et lien vers les réglages du système ; les autres boutons restent utilisables.
- **CL-2.** Application tuée pendant le téléversement : à la réouverture, les fichiers confirmés sont listés et les autres sont proposés à « Réessayer ».
- **CL-3.** Réseau perdu pendant l'analyse : la bannière hors ligne existante s'affiche (ADR-3014), puis l'interrogation reprend au retour du réseau.
- **CL-4.** Partage de 11 fichiers ou plus : les dix premiers sont ajoutés, avec un message pour le reste (`SIMPLE_TOO_MANY_SOURCES`).
- **CL-5.** Les cas limites de SPEC-4002 (CL-1, CL-4, CL-6) s'appliquent à l'identique.

## 8. Instructions d'implémentation

1. Libellés et composants partagés du parcours (`src/simple/`).
2. Cartes de l'écran Aujourd'hui, puis dépôt avec sélecteurs, téléversement et rôles.
3. Partage vers Learny (configuration native et réception).
4. Analyse, aperçu, diagnostic et résultat.
5. Tests Jest, flux Maestro, références visuelles ; preuves.

## 9. Fichiers et composants concernés

- **Créés** :
  - les routes d'ET-1 ;
  - `apps/mobile/src/simple/*` ;
  - `apps/mobile/e2e/flows/SPEC-4003-*.yaml` ;
  - `apps/mobile/test/simple/*.test.tsx` ;
  - les références `design/references/mode-simple/mobile-*`.
- **Modifiés** :
  - `apps/mobile/app/(app)/aujourdhui/index.tsx` (cartes) ;
  - `apps/mobile/app.config.ts` (partage) ;
  - `packages/i18n` (espace `mobile`) ;
  - le renvoi « Continuer sur le web » de la création (ADR-4002).
- **Réutilisés** : client API mobile, cache hors ligne, lecteur de quiz, écran Cours.

## 10. Interface et conformité visuelle

- **Maquette** : `design/mode-simple/index.html#view=mobile&plat=ios` et `&plat=android`, étapes 1 à 6 et état sans clé.
- **Référence** : capture 390×844 par étape et par plateforme. La conformité suit la méthode de la piste mobile : ligne de base versionnée (ADR-3021), écart de 12 % au plus, jetons natifs (ADR-3013).
- **Accessibilité** : libellés VoiceOver et TalkBack de chaque bouton et de chaque ligne de fichier, cibles de 44×44 points au moins, annonce de la fin de l'analyse.

## 11. Critères d'acceptation

- **CA-1.** Sur Android et sur iOS, le parcours complet (dépôt d'un cours et d'un TD, analyse, aperçu, diagnostic passé, premier chapitre) est prouvé par un flux Maestro filmé.
- **CA-2.** Un PDF partagé depuis une autre application ouvre le dépôt avec ce fichier ajouté.
- **CA-3.** Sans clé d'IA, la création est bloquée avec l'encart, puis débloquée après l'ajout de la clé, avec les fichiers conservés.
- **CA-4.** Les six écrans respectent la maquette mobile, avec un écart de 12 % au plus sur chaque plateforme.
- **CA-5.** **Parité** : chaque `testID` de SPEC-4002 ET-3 existe sur mobile, et les mêmes opérations d'API sont appelées pour le même parcours (journal des requêtes comparé au flux web).

## 12. Plan de tests

- **Unitaires** (Jest, `[SPEC-4003]`) : liste de fichiers et rôles, file de téléversement reprenable, état sans clé, réception d'un partage.
- **Intégration** (`[SPEC-4003]`) : client API du mode simple contre le serveur de test (mock).
- **End-to-end** (Maestro, `@SPEC-4003`, vidéo, Android puis iOS) :
  - `SPEC-4003-parcours.yaml` (CA-1) ;
  - `SPEC-4003-partage.yaml` (CA-2) ;
  - `SPEC-4003-sans-cle.yaml` (CA-3).
- **Visuel** (`@SPEC-4003 @visual`) : six étapes et état sans clé, iOS et Android (CA-4).
- **Parité** : `apps/mobile/test/simple/parity.test.ts` compare les `testID` à la liste de SPEC-4002 ; le flux e2e enregistre les opérations appelées (CA-5).
- **Non-régression** : flux de SPEC-3201, SPEC-3302 et SPEC-3304.

| Critère | Tests |
|---|---|
| CA-1 | `SPEC-4003-parcours.yaml` (Android, iOS) |
| CA-2 | `SPEC-4003-partage.yaml`, Jest « réception d'un partage » |
| CA-3 | `SPEC-4003-sans-cle.yaml`, Jest « état sans clé » |
| CA-4 | visuel des 6 étapes et de l'état sans clé |
| CA-5 | `parity.test.ts`, journal des opérations du flux |

## 13. Preuves attendues

`evidence/SPEC-4003/` : vidéos Maestro Android et iOS, captures par étape, comparaisons visuelles, rapport de parité et `acceptance.md`.

## 14. Définition de terminé

Définition commune et définition de la piste mobile (ADR-3016), avec en plus : parité prouvée avec SPEC-4002 (CA-5).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-4002, ADR-4003, ADR-4009, ADR-3003, ADR-3004, ADR-3014, ADR-3015.
- Décision de cette spécification : la croix du diagnostic équivaut à « Passer » (pas d'abandon silencieux).
- Hypothèse : le build iOS est validé sur l'agent appareil de la piste mobile (ADR-3018). Sinon, blocage `--external` pour iOS et preuve Android seule, consignés.
- Décision d'implémentation (ADR-4009) : la réception du partage passe par l'URI exposée par Expo Linking (`ACTION_SEND`/`ACTION_SEND_MULTIPLE` et « Ouvrir avec Learny » déclarés dans `app.config.ts`) ; les libellés propres au mobile vivent dans `mobileSimple.ts` tant que l'espace `simple` de SPEC-4002 n'est pas fusionné ; la campagne utilise un compte sans clé dédié.
