# Mode simple : « Dépose ton cours » (cadrage, brouillon)

> **Statut** : brouillon de conception (branche `feat/mode-simple`). Ce document n'est pas normatif tant qu'un ADR et des spécifications ne l'ont pas repris.

## 1. Problème

Aujourd'hui, la valeur de Learny n'apparaît qu'au bout d'un long parcours :

1. Premiers pas en cinq étapes (SCR-02).
2. Cadrage par chat, avec cinq questions au plus (BR-FOR-01, BR-FOR-02).
3. Programme proposé, à ajuster puis à valider (BR-FOR-04).
4. Apports déposés chapitre par chapitre (BR-APP-01).
5. Chapitre déclaré « terminé » (BR-APP-04).
6. Génération du cours.

Un apprenant qui a déjà son cours (polycopié, manuel, support de formation) doit refaire tout ce chemin pour obtenir ce qu'il possède déjà en substance.

## 2. Promesse

**« Dépose ton cours, on en fait une formation. »** Un fichier suffit. En quelques minutes, l'apprenant reçoit un programme structuré dont le **premier chapitre est jouable**. La mécanique reste ensuite la même : cours, tuteur, exercices, quiz de validation, révisions espacées, agenda, lacunes.

Le mode simple **ne remplace pas** le mode actuel. Il devient la porte d'entrée rapide, et le mode actuel la version experte (« Ajuster »).

**Principe : le mobile est iso web en fonctionnalités** (exigence du porteur, 2026-11-24). Le mode simple est livré en même temps sur le web et sur le mobile, avec les mêmes règles, la même API et les mêmes libellés. Seule l'ergonomie s'adapte : dépôt de fichier, appareil photo, partage. Aucun écran du parcours ne renvoie à « Continuer sur le web ».

## 2 bis. Décisions prises (2026-11-24)

| # | Sujet | Décision |
|---|---|---|
| D1 | Parité mobile | **Tout le produit est iso web sur mobile.** Un nouvel ADR remplace ADR-3002 : le mode simple d'abord, puis un plan de rattrapage des écrans exclus. |
| D2 | Point d'entrée | **Choix à l'accueil.** Les premiers pas restent tels quels. L'accueil propose deux cartes : « Dépose ton cours » (mode simple) et « Construire avec le tuteur » (mode actuel). |
| D3 | Fidélité | **Le document d'abord.** Cours, exercices et quiz viennent du document, avec citation des pages. Le tuteur peut reformuler ; tout complément extérieur est signalé comme tel. |
| D4 | Plusieurs fichiers | **Plusieurs documents dès le lot 1.** Le cours donne la structure ; les TD et annales alimentent les exercices et les quiz. |

## 3. Ce qui existe déjà

| Brique | Où | Ce qu'elle fait | Écart pour le mode simple |
|---|---|---|---|
| Import de programme | SPEC-605, `formation/application/import_file.py` | Structure un **plan** importé (PDF, DOCX, TXT, MD) | Importe un plan, pas une matière ; texte limité à 200 000 caractères |
| Apports | BR-APP-01 à BR-APP-07, `content/` | Extraction PDF, image, page web et YouTube ; passages repérés ; embeddings ; citations | Déposés chapitre par chapitre, une fois le programme créé ; PDF limité à 500 pages |
| Génération du cours | BR-APP-04, `content/application/generate.py` | Cours d'un module à partir de ses apports | Déclenchée par « chapitre terminé » |
| Banque de questions, quiz, FSRS, planning | `assessments/`, `learning/`, `tutor/` | Exercices, validation, révisions, agenda | Rien à changer |

**Idée centrale** : le document déposé sert à la fois de **source du programme** et d'**apport de chaque chapitre**. Le mode simple relie ce qui existe ; il ne crée pas un moteur parallèle.

## 4. Parcours (identique sur web et mobile)

0. **Accueil** : la carte « Dépose ton cours », à côté de « Construire avec le tuteur » (D2).
1. **Dépôt** : un seul écran avec une zone de dépôt qui accepte **un ou plusieurs fichiers** (D4), « ou colle un lien YouTube ou une page web ». Chaque fichier reçoit un rôle deviné et modifiable : cours, TD ou exercices, annales. Une phrase facultative : « Pourquoi ? (examen le…, projet, culture) ».
2. **Analyse** (moins de 60 s) : extraction, détection de la structure (signets, table des matières, titres), estimation du volume. Le résultat s'affiche au fil de l'eau : « J'ai trouvé 14 chapitres… ».
3. **Aperçu du programme** : modules et chapitres, durée estimée, rythme du profil, date de fin calculée. Une question au plus : « Tu as une échéance ? ». Deux boutons : **C'est parti** ou **Ajuster** (qui ouvre l'ajustement avec le tuteur du mode actuel).
4. **Premier chapitre prêt** : le cours, les exercices et le quiz du module 1 sont générés en priorité. Le reste se génère en tâche de fond, module par module, toujours avec une avance sur l'apprenant.

### Valeurs déduites à la place du cadrage

| Rubrique du cadrage (BR-FOR-02) | Valeur en mode simple |
|---|---|
| Périmètre | Le contenu du document |
| Point de départ | Débutant par défaut (voir Q2) |
| Niveau visé | Maîtrise du contenu du document |
| Volume | Déduit du nombre de pages et de la densité (heures) |
| Dates et calendrier | Début aujourd'hui ; fin calculée au rythme du profil, ou à l'échéance donnée |
| Objectif (BR-FOR-03) | « Examen » si une échéance est donnée, sinon « opérationnel » |

## 5. Pipeline pour les gros documents

1. **Extraction unique** du texte, avec repérage des pages (passages BR-APP-06).
2. **Découpage structurel**, dans cet ordre de préférence : signets du PDF, puis titres détectés, puis découpage par taille.
3. **Résumé par section** (étape « map »), puis **plan global** construit sur les résumés (étape « reduce »).
4. **Génération par chapitre**, avec le texte du chapitre et le résumé global ; le module 1 passe en priorité.
5. Le tuteur, les quiz et les citations s'appuient sur les passages et les embeddings existants.

Les jobs passent par l'outbox du worker Python ; leurs noms restent à définir. Ordre de grandeur : un PDF de 700 pages représente environ 400 000 à 700 000 tokens. Le coût revient à **une lecture complète**, plus des appels courts et ciblés.

## 6. Règles et décisions à faire évoluer (ADR)

| Règle | Aujourd'hui | Proposition |
|---|---|---|
| BR-APP-02 | PDF ≤ 500 pages, ≤ 50 Mo | Relever pour le mode simple (au moins 1 000 pages ?) avec un plafond de coût |
| BR-FOR-01, BR-FOR-02 | Cadrage obligatoire | Facultatif en mode simple (valeurs déduites, §4) |
| BR-APP-04 | Génération après « chapitre terminé » | Génération automatique et progressive en mode simple |
| BR-FOR-10 | Trois formations actives au plus | Inchangée |
| SCR-02 (premiers pas) | Obligatoires avant de commencer | Inchangés (D2) |
| SCR-03 (accueil) | Création par « Nouvelle formation » | Deux cartes : « Dépose ton cours » et « Construire avec le tuteur » (D2) |
| BR-APP-05 (ressources web) | Le tuteur suggère des ressources | En mode simple, un complément extérieur est toujours étiqueté comme tel (D3) |
| ADR-3002 (mobile) | Mobile « compagnon » : premiers pas, création et cadrage, apports, exercices, examen blanc, lacunes, carte, bilan, groupes et recherche renvoyés au web | **À remplacer** par un ADR « mobile iso web » : le mode simple en premier, puis un plan de rattrapage des écrans exclus |
| BR-APP-08, BR-APP-09 | Audio et vidéo en fichier prévus en V2 | Lot ultérieur |
| IA et abonnement | Coûts par appel | Plafond par document selon l'abonnement |

## 7. Spécificités mobiles

Fonctionnellement, tout est identique au web. Ce qui suit ne concerne que l'ergonomie native.

- Sélecteur de fichier (`expo-document-picker`) et photos de pages (appareil photo ou galerie, plusieurs images, lecture OCR).
- « Ouvrir avec Learny » ou partage depuis une autre application (extension de partage).
- Téléversement reprenable : un gros PDF sur réseau mobile ne doit pas échouer à 90 %.
- Notification push « Ton programme est prêt » si l'apprenant a quitté l'écran (P35).

## 8. Découpage proposé en lots

0. **Lot 0** : ADR « mobile iso web » qui remplace ADR-3002 (D1), avec le plan de rattrapage des écrans mobiles exclus.
1. **Lot 1** : un ou plusieurs PDF, DOCX ou fichiers texte deviennent une formation (web et mobile en même temps), avec rôles des fichiers, aperçu et premier chapitre prioritaire, dans les limites actuelles.
2. **Lot 2** : gros documents, avec découpage structurel, génération progressive et plus de 500 pages.
3. **Lot 3** : photos de pages (plusieurs images), lien YouTube, page web.
4. **Lot 4** : fichiers vidéo et audio (transcription).

**Prérequis** : la passerelle LLM réelle. Le backend refuse aujourd'hui de démarrer hors `LLM_MODE=mock` (point ouvert d'ADR-2042).

## 9. Questions ouvertes

Q1 (point d'entrée), Q3 (fidélité), Q4 (plusieurs fichiers) et Q8 (iso web) sont tranchées : voir §2 bis.

- **Q2, positionnement** : propose-t-on un court quiz diagnostic pour sauter ce que l'apprenant sait déjà ?
- **Q5, limites et coût** : quel plafond par document et par abonnement ?
- **Q6, granularité** : pour 700 pages, combien de modules, et quelle durée de séance cible ?
- **Q7, droits** : les documents restent privés à leur propriétaire (BR-APP-03), y compris en groupe.
