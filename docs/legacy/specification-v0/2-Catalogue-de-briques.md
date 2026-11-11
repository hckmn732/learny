# Catalogue de briques

Le catalogue fixe ce que l'application sait afficher et exécuter. Il compte trois niveaux : des objets de structure, des briques élémentaires codées, et des activités que le tuteur assemble librement.

## Trois niveaux

&#91;embedded content: trois niveaux du catalogue · 8 activités, 13 briques dont 5 jeux, 8 objets\]

Plus on monte, plus c'est libre : le tuteur invente des activités sans code, mais ne crée ni nouveau type de brique ni nouvel objet de structure.

## Objets de structure

Les objets de structure portent l'état durable de la formation, organisée en modules puis en chapitres. La notion en est le pivot : questions, révisions, quiz global et sources s'y rattachent.

| Objet | Rôle | Champs principaux | Créé par |
| --- | --- | --- | --- |
| Formation | Le cadre d'ensemble | Titre, description, objectifs (opérationnel, examen, dialogue, projet), niveau initial et visé, volume de formation, dates, calendrier, disponibilités | Le tuteur, à partir du cadrage ; validé par l'apprenant |
| Module | Une thématique du programme | Formation, titre, ordre, objectifs pédagogiques, dates prévues, seuil de validation, statut (verrouillé, ouvert, validé) | Le tuteur, ou l'import du programme ; validé par l'apprenant |
| Chapitre | Une partie d'un module | Module, titre, ordre, apports déposés, statut des apports (en cours, terminé) | Le tuteur, ou l'import du programme |
| Notion | L'unité de connaissance à maîtriser | Chapitre, intitulé, définition courte, sources, état de mémorisation, niveau de maîtrise, lacune et sa nature | Le tuteur ; état de mémorisation calculé par l'algorithme |
| Ressource | Un apport déposé ou une ressource suggérée | Chapitre, type (idée, brouillon, texte structuré, PDF, audio, vidéo), contenu ou fichier, transcription, passages découpés, origine | L'apprenant (dépôt) ou le tuteur (suggestion web) |
| Créneau | Une activité placée dans l'agenda | Date, durée, activité, statut (prévu, fait, manqué) | Le tuteur |
| Rappel | Une relance programmée | Objet (révision, quiz, session), moment, canal (e-mail, navigateur), message, statut | Le tuteur ; envoyé par l'application |
| Résultat | La trace d'une tentative | Activité, numéro de tentative, réponses, score par notion, lacunes détectées, retour du tuteur | L'application (réponses) et le tuteur (analyse) |

## Briques élémentaires

Treize briques codées suffisent à construire toutes les activités prévues, dont cinq jeux de mémorisation. Chacune a un format fixe et un affichage ; les briques interactives renvoient une réponse au tuteur.

| Brique | Ce qu'elle affiche | Ce que fait l'apprenant | Ce qui revient au tuteur | Champs obligatoires |
| --- | --- | --- | --- | --- |
| Texte | Un contenu rédigé : titres, listes, tableaux, code, formules | Il lit | Progression de lecture | Contenu, notions liées, origine |
| Extrait de ressource | Un passage précis : page d'un PDF, minute d'une vidéo ou d'un audio, extrait de texte | Il ouvre le passage | — | Ressource, emplacement |
| Question à choix | Un énoncé et 2 à 6 options, une ou plusieurs justes | Il choisit | Réponse, justesse, temps de réponse | Énoncé, options, bonnes réponses, explication, notion, objectif |
| Question ouverte | Un énoncé et une zone de réponse | Il rédige sa réponse | Réponse, note et retour du tuteur, éléments manquants | Énoncé, éléments attendus, critères de correction, notion, objectif |
| Texte à trous | Un texte dont des mots clés sont masqués | Il complète les trous, sans liste de choix | Réponses, justesse par trou | Texte, trous et réponses acceptées, notion |
| Association | Deux colonnes à relier : terme et définition, cause et effet | Il relie les paires | Paires formées, erreurs | Paires correctes, notions |
| Remise en ordre | Des étapes mélangées | Il les remet dans l'ordre | Ordre proposé, écarts avec l'ordre attendu | Étapes dans l'ordre correct, notion |
| Classement | Des éléments à ranger dans des catégories | Il range chaque élément dans sa catégorie | Classement proposé, erreurs | Catégories, éléments et leur catégorie, notions |
| Carte de rappel | Une question au recto, la réponse au verso | Il cherche de tête, retourne la carte, puis s'auto-évalue | Auto-évaluation : raté, difficile, bon, facile | Recto, verso, notion |
| Consigne | Une tâche à réaliser et le livrable attendu | Il dépose sa production : texte, fichier ou lien | Production, évaluation selon les critères | Tâche, livrable, critères de réussite, notions |
| Dialogue scénarisé | Une scène où le tuteur joue un rôle : client, expert, collègue, novice | Il échange par chat jusqu'à la fin de la scène | Transcription, évaluation selon les critères | Rôle, contexte, objectif de l'apprenant, condition de fin, critères |
| Minuteur | Le temps restant | Il voit le décompte ; la saisie se verrouille à la fin | Temps utilisé | Durée, briques concernées |
| Barème | Les points et le seuil de réussite | Il voit sa note à la fin | Note, réussite ou échec | Points par brique, seuil |

La question à choix est corrigée par l'application, sans appel au tuteur. La question ouverte, la consigne et le dialogue sont évalués par le tuteur, selon les critères fixés à la création de la brique.

Les jeux de mémorisation sont corrigés par l'application, comme la question à choix. Leurs erreurs d'association ou de classement révèlent souvent une confusion entre deux notions : le tuteur l'enregistre comme telle dans les lacunes.

## Activités

Une activité est un assemblage de briques élémentaires décidé par le tuteur. Une activité nouvelle ne demande aucun code tant qu'elle n'utilise que ces briques.

| Activité | Briques assemblées | Quand le tuteur la génère | Ce qu'elle alimente |
| --- | --- | --- | --- |
| Cours | Texte Markdown et extraits de ressource, organisés par chapitre | Quand l'apprenant a terminé ses apports | Progression du module |
| Quiz de validation | Questions à choix, questions ouvertes, barème avec seuil ; nouvelles questions à chaque tentative, tirées de la banque de la notion | Après la relecture du cours, puis à chaque nouvelle tentative | Déblocage du module suivant, lacunes, remédiation |
| Session de quiz global | Questions et jeux de mémorisation sur les notions dues, tous les modules de la formation mêlés, tirés de la banque préparée la veille | Chaque jour où des notions sont dues | État de mémorisation de chaque notion |
| Remédiation | Texte ciblé, extraits de ressource, nouvelles questions | Après un quiz sous le seuil de réussite | Nouveau résultat sur les notions faibles |
| Exercice pratique | Consigne, texte d'aide | Dans un module, selon l'objectif | Résultat et lacunes |
| Mise en situation | Dialogue scénarisé, barème | Pour un objectif opérationnel ou de dialogue avec des experts | Résultat et lacunes |
| Projet fil rouge | Suite de consignes réparties sur la formation, barème | À la configuration ; étapes placées dans l'agenda | Livrables évalués, évaluation finale |
| Examen blanc | Questions, minuteur, barème | Avant l'échéance de l'examen visé | Note, lacunes, révisions ciblées |

Le tuteur varie les formats : une même notion revient en question, en texte à trous ou en association. L'apprenant doit ainsi retrouver la notion, pas une réponse apprise par cœur.

## Actions du tuteur

Le tuteur n'écrit jamais directement dans les données : il demande des actions, que l'application vérifie puis exécute.

| Action | Ce qu'elle fait | Garde-fou |
| --- | --- | --- |
| Lire les ressources | Renvoie les passages utiles d'un module, retrouvés par recherche sémantique | Lecture seule ; budget de tokens fixé par tâche |
| Rechercher sur le web | Sert à concevoir le parcours et à suggérer des ressources | Le résultat n'entre jamais tel quel dans un cours |
| Créer ou modifier | Crée ou met à jour un objet de structure ou une brique | Format vérifié ; une modification crée une nouvelle version |
| Assembler une activité | Regroupe des briques existantes en activité | Toutes ses briques doivent être valides |
| Planifier | Place une activité dans l'agenda | Respecte les disponibilités déclarées |
| Programmer un rappel | Prévoit une relance à un moment donné | Plafond quotidien réglable par l'apprenant |
| Demander les notions dues | Interroge l'algorithme de répétition espacée | Les dates viennent de l'algorithme, jamais du tuteur |
| Lire les résultats | Renvoie les résultats et l'état de mémorisation | Lecture seule |
| Évaluer une réponse | Enregistre la note et le retour sur une réponse ouverte, une production ou un dialogue | Note bornée par le barème |
| Préparer une banque de questions | Génère plusieurs variantes par notion et par format de question ou de jeu | Lancée en lot, en différé ; régénérée seulement quand la banque est épuisée |

## Règles de validation communes

Une brique qui enfreint une seule de ces règles est refusée et renvoyée au tuteur avec l'erreur.

- **Format** : la brique respecte le schéma de son type, champs obligatoires présents et valeurs dans les bornes.
- **Notion** : toute brique pédagogique est rattachée à au moins une notion existante.
- **Origine** : toute brique de contenu indique d'où elle vient, ressource importée ou connaissances du tuteur.
- **Références** : toute notion, ressource, emplacement ou brique citée existe.
- **Versions** : une modification crée une nouvelle version ; les résultats passés restent liés à la version utilisée.
- **Signalement et correction** : l'apprenant peut signaler une brique erronée, qui sort du quiz global jusqu'à sa correction par le tuteur, ou la corriger lui-même ; sa correction passe les mêmes règles de format.

## Décisions sur le catalogue

Quatre choix fixent le fonctionnement fin du catalogue ; le suivi par notion reste à valider sur un premier domaine test.

| Sujet | Décision |
| --- | --- |
| Mémorisation | Suivie par notion : le tuteur varie les questions et les jeux, l'algorithme suit la notion. L'adaptation de FSRS est à tester sur un premier domaine |
| Confiance | Non demandée : la note transmise à l'algorithme se déduit de la justesse et du temps de réponse ; seule la carte de rappel garde son auto-évaluation |
| Modification | L'apprenant peut signaler une brique erronée ou la corriger lui-même ; une correction crée une nouvelle version |
| Granularité | Le nombre de notions par chapitre est laissé au tuteur, calibré sur un premier domaine test |
