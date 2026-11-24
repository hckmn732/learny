# ADR-4003 — Mode simple : création d'une formation par dépôt de documents

- **Statut** : Acceptée
- **Origine** : Validée (décisions D1 à D7 du porteur du projet, 2026-11-24)
- **Date** : 2026-11-24
- **Liens** : ADR-0005, ADR-0008, ADR-0039, ADR-0340, ADR-4001, ADR-4002, SPEC-605, SPEC-607, SPEC-608, SPEC-4001, SPEC-4002, SPEC-4003

## Contexte

Créer une formation demande aujourd'hui six étapes avant le premier cours :
1. les premiers pas ;
2. le cadrage par chat ;
3. la validation du programme proposé ;
4. le dépôt des apports chapitre par chapitre ;
5. la déclaration « chapitre terminé » ;
6. la génération du cours.

Un apprenant qui possède déjà son cours refait tout ce chemin. Le cadrage complet et les maquettes sont dans `docs/product/mode-simple.md` et `design/mode-simple/index.html`.

## Décision

### Produit (décisions D1 à D7 du cadrage)

1. **Deux modes de création.** Le mode actuel, par cadrage avec le tuteur, est inchangé. Le **mode simple** s'y ajoute. L'accueil propose deux cartes : « Dépose ton cours » et « Construire avec le tuteur » (D2). Les premiers pas restent inchangés.
2. **Dépôt.** L'apprenant dépose **un ou plusieurs documents** en une fois (D4) : PDF, DOCX, TXT, Markdown, images, lien vers une page web ou une vidéo YouTube. Chaque document reçoit un **rôle** deviné et modifiable :
   - `course` : il donne la structure du programme ;
   - `exercises` et `exam_papers` : ils alimentent les exercices et les quiz ;
   - `other` : support complémentaire.

   Une motivation facultative de 300 caractères au plus oriente le ton et l'objectif.
3. **Programme tiré du document** (D7). La structure suit le document de rôle `course`, dans cet ordre de préférence : signets du PDF, table des matières, titres détectés, découpage par taille. Un chapitre du document donne un **module** de 2 à 8 h d'étude ; un module plus court est fusionné avec le suivant, un plus long est découpé. Les chapitres Learny visent des séances de 20 à 45 min. Chaque module et chaque chapitre gardent la plage de pages de leur source.
4. **Cadrage déduit.** Les rubriques de BR-FOR-02 sont remplies sans question :
   - périmètre : le document ;
   - point de départ : débutant, corrigé ensuite par le diagnostic ;
   - niveau visé : maîtrise du contenu du document ;
   - volume : estimé d'après le nombre de pages et leur densité ;
   - dates : début aujourd'hui, fin calculée au rythme du profil.

   L'aperçu pose **une seule** question, l'échéance. Si elle est donnée, l'objectif devient `exam`, sinon `operational`.
5. **Diagnostic global** (D5). Après validation, un diagnostic facultatif est proposé : une à deux questions par module, environ 10 min, générées depuis les résumés de sections. Un module dont toutes les questions sont justes est **validé** et ses notions entrent dans le quiz global. Le diagnostic peut être passé à tout moment.
6. **Fidélité au document** (D3). Cours, exercices et quiz sont tirés du document et citent les pages (BR-APP-06). Le tuteur peut reformuler ; tout complément extérieur est marqué « Hors document ». La recherche web ne nourrit jamais un cours (BR-IA-12, inchangée).
7. **Génération progressive.** Dès la validation, le cours du premier module non acquis est généré en priorité, puis celui du suivant. Les autres sont générés en tâche de fond, par lots quand le fournisseur le permet (BR-IA-13), et toujours au moins deux modules en avance sur l'apprenant.
8. **Coût** (D6). Aucune estimation ni seuil de confirmation : l'apprenant paie avec sa propre clé (BR-IA-06) et les appels sont journalisés comme les autres (BR-IA-08). Sans clé ni modèle choisi pour les tâches concernées, le dépôt reste possible mais l'analyse est refusée avec un renvoi direct vers l'ajout de la clé. Les documents restent déposés.
9. **Parité** (D1). Le parcours est identique sur le web et sur le mobile (ADR-4002).

### Règles métier modifiées

| Règle | Modification |
|---|---|
| BR-FOR-01, BR-FOR-02 | Le cadrage par chat ne s'applique qu'au mode « tuteur » ; en mode simple, les rubriques sont déduites (point 4). |
| BR-FOR-04 | Troisième origine du programme : **tiré des documents déposés** (`programme_source = 'document'`). |
| BR-APP-01 | En mode simple, les documents sont déposés au niveau de la formation puis rattachés aux chapitres par plage de pages. |
| BR-APP-04 | En mode simple, la génération du cours est automatique et progressive (point 7) ; l'apprenant n'a pas à déclarer les chapitres terminés. |
| BR-FOR-16 | Une formation en mode simple, en cours d'analyse ou à valider, apparaît à l'accueil avec « Continuer ». |

Les autres règles sont inchangées, notamment :
- BR-FOR-10 : trois formations actives au plus ;
- BR-APP-02 : PDF de 500 pages au plus pour le lot 1, relevé par un ADR du lot 2 ;
- BR-APP-03 : documents privés ;
- BR-IA-10 : un document est une donnée, jamais une instruction.

### Lots

- **Lot 1 (P40)** : tout ce qui précède, dans les limites actuelles de BR-APP-02.
- **Lot 2** : documents au-delà de 500 pages (plafond et découpage à définir par ADR).
- **Lot 3** : fichiers vidéo et audio, avec transcription (BR-APP-08, BR-APP-09).

## Conséquences

- Le schéma s'étend :
  - `formations.creation_mode` (`tutor|simple`) ;
  - `programme_source` reçoit la valeur `document` ;
  - `activity_kind` reçoit la valeur `diagnostic` ;
  - une table `chapter_sources` relie chapitres et documents par plage de pages ;
  - une table `simple_analyses` suit l'analyse.

  Le détail est dans SPEC-4001.
- `docs/product/business-rules.md` est mis à jour par SPEC-4001 pour refléter le tableau ci-dessus.
- Le lot 1 ne crée aucun moteur parallèle : cours, quiz, banque de questions, FSRS et planificateur sont réutilisés tels quels.
