---
id: SPEC-4002
title: Mode simple — parcours web « Dépose ton cours »
phase: P40
priority: mode-simple
depends_on: [SPEC-4001]
business_rules: [BR-FOR-04, BR-FOR-13, BR-FOR-16, BR-APP-01, BR-APP-02, BR-APP-07, BR-IA-06, BR-PLA-03]
screens: [SCR-03, SCR-21, SCR-22, SCR-23, SCR-24]
adrs: [ADR-4002, ADR-4003, ADR-0034, ADR-0046]
visual: mockup
---

# SPEC-4002 — Mode simple : parcours web

## 1. Objectif

Livrer sur le web les six étapes du mode simple (ADR-4003) sur le contrat de SPEC-4001 :
1. les deux cartes de l'accueil ;
2. le dépôt ;
3. l'analyse ;
4. l'aperçu du programme ;
5. le diagnostic ;
6. le premier chapitre prêt.

Chaque écran suit `design/mode-simple/index.html`.

## 2. Contexte

À lire :
- `design/mode-simple/index.html` (étapes 1 à 6, vue Web, état « Sans clé d'IA ») et son README ;
- `docs/product/mode-simple.md` ;
- ADR-4003 ;
- `docs/product/screens.md` ;
- les composants existants de l'accueil (SPEC-603), du programme (SPEC-605), du quiz (SPEC-611) et des apports (SPEC-607).

Les routes sont en français (ADR-0046). Les libellés vont dans `packages/i18n` (espace `simple`), copiés à l'identique des maquettes.

## 3. Dépendances

- **SPEC-4001** (`done`) : opérations `formations.simple.*`, `sources.*`, `resources.role`, `diagnostic.*`, et les erreurs d'ET-2.
- Composants existants : coquille (SPEC-304 à 307), téléversement d'apports (SPEC-607), lecteur de quiz (SPEC-611), liste des formations (SPEC-603).

## 4. Règles métier couvertes

- **BR-FOR-04** : l'aperçu affiche le programme tiré du document ; « Ajuster avec le tuteur » ouvre l'ajustement existant.
- **BR-FOR-13 et BR-FOR-16** : une formation en mode simple à l'état `collecting`, `analysing` ou `proposed` apparaît dans « En cours » avec « Continuer », qui ramène à l'étape en cours.
- **BR-APP-01, BR-APP-02, BR-APP-07** : dépôt multiple avec les limites et les statuts de traitement existants (« Réessayer »).
- **BR-IA-06** : l'état sans clé d'IA bloque « Créer ma formation » et mène aux Paramètres, section `#modeles`, avec retour à la page de dépôt.
- **BR-PLA-03** : accessibilité WCAG 2.2 AA.

## 5. Exigences fonctionnelles

- **EF-1. Accueil** (`/accueil`, SCR-03, étape 1 de la maquette). Une section « Commencer une formation » montre deux cartes :
  - « Dépose ton cours », sur fond citron, avec le badge « Nouveau · le plus rapide » et le bouton « Déposer mes fichiers » vers `/formations/depot` ;
  - « Construire avec le tuteur », avec le bouton « Commencer le cadrage » vers le parcours existant `/formations/nouvelle`.

  Le bouton d'en-tête « Nouvelle formation » ouvre une boîte de dialogue avec les deux mêmes cartes. La section reste visible tant que l'utilisateur a moins de trois formations actives.
- **EF-2. Dépôt** (`/formations/depot`, SCR-21, étape 2).
  - **Zone de dépôt** : glisser-déposer ou parcourir, plusieurs fichiers.
  - **Fichier déposé** : il crée la formation (`formations.simple.create`, une seule fois), redirige vers `/formations/[fid]/depot`, puis téléverse avec une barre de progression par fichier.
  - **Ligne d'un fichier** : nom, pages et taille, sélecteur de rôle (« Cours », « Exercices », « Annales », « Autre support »), bouton « Retirer ».
  - **Lien** : champ « Ou colle un lien : vidéo YouTube, page web… ».
  - **Motivation** : champ facultatif « Pourquoi tu l'apprends ? ».
  - **Bouton « Créer ma formation »** : actif dès qu'un fichier de rôle « Cours » est prêt.
- **EF-3. Sans clé d'IA.** Si `formations.simple.analysis` répond `AI_NOT_CONFIGURED`, ou si la vérification préalable des modèles échoue, l'encart « Ajoute ta clé d'IA pour continuer » s'affiche, « Créer ma formation » est désactivé, et « Ajouter ma clé » ouvre `/parametres#modeles?retour=/formations/[fid]/depot`. Les fichiers restent affichés.
- **EF-4. Analyse** (`/formations/[fid]/depot`, état `analysing`, SCR-22, étape 3).
  - Titre « On lit tes documents ».
  - Quatre étapes avec leur état et leur détail (EF-6 de SPEC-4001), une barre de progression, et la liste « Chapitres trouvés dans le manuel » alimentée au fil de l'eau (interrogation toutes les 2 s).
  - Mention « Tu peux quitter cette page : on te prévient dès que ton programme est prêt. » Une notification in-app « Ton programme est prêt » est créée à la fin.
  - En cas d'échec : message lisible et bouton « Réessayer ».
- **EF-5. Aperçu** (`/formations/[fid]/apercu`, SCR-23, étape 4).
  - Badge « Programme prêt », titre de la formation, ligne « D'après … » qui liste les documents.
  - Quatre indicateurs : modules, heures d'étude, heures par jour, fin prévue.
  - Liste des modules, chacun avec ses chapitres, ses heures et sa plage de pages ; au-delà de 6 modules, la mention « + N autres modules ».
  - Bloc « Tu as une échéance ? » : « Non, à mon rythme » ou « Oui, le… » avec un sélecteur de date. Le choix appelle `PATCH /formations/{fid}` et les indicateurs se recalculent.
  - « C'est parti » appelle `programme.validate` puis ouvre le diagnostic ; « Ajuster avec le tuteur » ouvre l'ajustement existant.
- **EF-6. Diagnostic** (`/formations/[fid]/diagnostic`, SCR-24, étape 5).
  - Badge « Diagnostic · 10 min », titre « Sautons ce que tu sais déjà », progression « Question n sur N ».
  - Le module de la question est affiché, sans correction question par question.
  - « Valider » et « Je ne sais pas » (réponse vide) ; « Passer le diagnostic », toujours visible, appelle `diagnostic.skip`.
- **EF-7. Résultat et premier chapitre** (`/formations/[fid]/diagnostic/resultat`, étape 6).
  - Ligne « Diagnostic terminé · x bonnes réponses sur N » et titre « k modules déjà acquis » (ou « Aucun module acquis : on commence au début »).
  - Carte noire « Ton premier chapitre est prêt » : module, chapitre, durée, nombre d'exercices, pages, bouton « Commencer » vers le cours existant.
  - Liste « Préparation du programme » (EF-12 de SPEC-4001), mise à jour toutes les 5 s.
  - Si le diagnostic a été passé, la même page s'ouvre sans la ligne de score.

## 6. Exigences techniques

- **ET-1.** Pages App Router :
  - `apps/web/app/(app)/formations/depot/page.tsx` ;
  - `apps/web/app/(app)/formations/[fid]/depot/page.tsx` ;
  - `apps/web/app/(app)/formations/[fid]/apercu/page.tsx` ;
  - `apps/web/app/(app)/formations/[fid]/diagnostic/page.tsx` ;
  - `apps/web/app/(app)/formations/[fid]/diagnostic/resultat/page.tsx`.

  Les composants vont dans `apps/web/components/simple/`. Les appels passent par `@learny/api-client`.
- **ET-2.** Le téléversement réutilise le client de SPEC-607 (URL signée, puis `resources.finalize`). Plusieurs fichiers partent en parallèle, trois au plus à la fois.
- **ET-3.** `data-testid` :
  - `simple-card-drop`, `simple-card-tutor` ;
  - `simple-dropzone`, `simple-file-{i}`, `simple-role-{i}`, `simple-link`, `simple-motivation`, `simple-create` ;
  - `simple-key-warning` ;
  - `simple-steps`, `simple-chapters-found` ;
  - `simple-kpis`, `simple-modules`, `simple-deadline`, `simple-start`, `simple-adjust` ;
  - `diagnostic-progress`, `diagnostic-skip` ;
  - `simple-ready-card`, `simple-generation`.
- **ET-4.** Accessibilité :
  - la zone de dépôt est activable au clavier et annonce les fichiers ajoutés (`aria-live`) ;
  - la progression de l'analyse est annoncée ;
  - le diagnostic suit les règles du quiz de SPEC-611 ;
  - les contrastes respectent les jetons.

## 7. Comportements attendus et cas limites

- **CL-1.** Fichier refusé (format, taille ou nombre de pages) : la ligne affiche le message de l'API, sans bloquer les autres fichiers.
- **CL-2.** Onze documents ou plus : le onzième est refusé (`SIMPLE_TOO_MANY_SOURCES`).
- **CL-3.** Rechargement en pleine analyse : la page reprend l'état serveur (aucun état local requis).
- **CL-4.** Limite de trois formations actives à « C'est parti » : la boîte de dialogue existante de BR-FOR-10 s'ouvre.
- **CL-5.** Hors ligne : la bannière existante s'affiche (SPEC-801) ; le dépôt est désactivé.
- **CL-6.** Double clic sur « Créer ma formation » ou sur « C'est parti » : un seul appel (bouton désactivé pendant la requête).

## 8. Instructions d'implémentation

1. Libellés `simple.*` dans `packages/i18n` (texte exact des maquettes).
2. Cartes de l'accueil et boîte de dialogue du choix.
3. Page de dépôt : zone, liste, rôles, lien, motivation, état sans clé.
4. Analyse avec interrogation, puis aperçu avec échéance et validation.
5. Diagnostic et page de résultat.
6. Tests e2e, visuels et unitaires ; preuves.

## 9. Fichiers et composants concernés

- **Créés** : les pages d'ET-1, `apps/web/components/simple/*`, `apps/web/e2e/specs/SPEC-4002-*.spec.ts`, les références visuelles `design/references/mode-simple/*`.
- **Modifiés** : l'accueil (`apps/web/app/(app)/accueil/*`), la boîte de dialogue de « Nouvelle formation », `packages/i18n`, `docs/product/screens.md` (SCR-21 à SCR-24).
- **Réutilisés** : client de téléversement, lecteur de quiz, coquille, bannière hors ligne.

## 10. Interface et conformité visuelle

- **Maquette** : `design/mode-simple/index.html`, vue Web, étapes 1 à 6 ; état « Sans clé d'IA » via `#step=1&nokey=1`. Hors des cartes ajoutées, l'accueil reste conforme à `Main.dc.html`.
- **Références** : capturées avec `node tools/design/capture-references.mjs` étendu au dossier `design/mode-simple/`. Formats : bureau 1440×900 et mobile web 390×844, horloge figée (ADR-0047). Destination : `design/references/mode-simple/`.
- **Contrôles** (`docs/engineering/testing.md` §6, ADR-0034) : jetons, éléments structurels par `data-testid`, comparaison côte à côte avec un écart de 12 % au plus.
- **Responsive** : sous 768 px, les cartes de l'accueil et les colonnes passent en une colonne, comme dans la vue Mobile de la maquette.

## 11. Critères d'acceptation

- **CA-1.** Depuis l'accueil, déposer un cours et un TD, lancer l'analyse, valider et commencer le premier chapitre se fait sans autre saisie que les fichiers (vidéo e2e).
- **CA-2.** Sans clé d'IA, l'encart s'affiche, la création est bloquée, et « Ajouter ma clé » ramène au dépôt avec les fichiers intacts.
- **CA-3.** Choisir une échéance recalcule les indicateurs de l'aperçu (fin prévue et heures par jour).
- **CA-4.** « Passer le diagnostic » mène au premier chapitre sans module acquis ; un diagnostic réussi sur le module 1 l'affiche comme acquis.
- **CA-5.** Les six écrans respectent la maquette, avec un écart de 12 % au plus et les jetons conformes ; axe ne signale aucune violation.
- **CA-6.** Une formation en cours d'analyse apparaît à l'accueil avec « Continuer », qui ramène à l'analyse.

## 12. Plan de tests

- **Unitaires** (Vitest, `[SPEC-4002]`) : composants de la liste de fichiers (rôles, retrait), calcul d'affichage des indicateurs, état sans clé.
- **Intégration** (`[SPEC-4002]`) : client API du mode simple sur le serveur de test (mock).
- **End-to-end** (`@SPEC-4002`, vidéo) dans `apps/web/e2e/specs/SPEC-4002-mode-simple.spec.ts` :
  - parcours complet (CA-1) ;
  - parcours sans clé (CA-2) ;
  - échéance (CA-3) ;
  - diagnostic passé ou réussi (CA-4) ;
  - « Continuer » depuis l'accueil (CA-6).
- **Visuel** (`@SPEC-4002 @visual`) : les six étapes et l'état sans clé, en bureau et en mobile web (CA-5).
- **Non-régression** : `@SPEC-603`, `@SPEC-604`, `@SPEC-605`, `@SPEC-611`.

| Critère | Tests |
|---|---|
| CA-1 | e2e « parcours complet » |
| CA-2 | e2e « sans clé », unitaire de l'état sans clé |
| CA-3 | e2e « échéance », unitaire des indicateurs |
| CA-4 | e2e « diagnostic passé / réussi » |
| CA-5 | visuel des 6 étapes et de l'état sans clé ; axe |
| CA-6 | e2e « Continuer » |

## 13. Preuves attendues

`evidence/SPEC-4002/` : vidéos e2e, captures des six étapes, comparaisons visuelles, rapport axe et `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), avec en plus :
- les nouveaux écrans sont décrits dans `screens.md` ;
- la parité avec SPEC-4003 est vérifiée au checkpoint CP-40.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-4002, ADR-4003, ADR-0034, ADR-0046.
- Décisions de cette spécification :
  - routes `/formations/depot`, `/formations/[fid]/{depot,apercu,diagnostic,diagnostic/resultat}` ;
  - identifiants d'écran SCR-21 (dépôt), SCR-22 (analyse), SCR-23 (aperçu), SCR-24 (diagnostic et résultat).
