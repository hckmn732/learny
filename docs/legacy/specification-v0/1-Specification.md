# Spécification — Learny, outil d'apprentissage intensif

Nov 11, 2026 · @Kengo Benito · Version 0 — en construction

## Vision et problème

L'outil permet de se former intensivement à n'importe quel domaine nouveau et d'en retenir durablement l'essentiel. Un tuteur IA conçoit le parcours, transforme les ressources de l'apprenant en cours structurés, l'évalue et le relance jusqu'à son objectif.

Il répond à quatre freins rencontrés quand on aborde un nouveau domaine :

- **Informations dispersées** : trop de sources, pas de priorités, pas de point de départ.
- **Mémorisation fragile** : ce qui est appris s'oublie en quelques jours.
- **Manque de pratique** : la théorie est comprise mais pas appliquée.
- **Irrégularité** : pas de rythme, pas de vision de sa progression, décrochage.

Exemple : un apprenant veut se former à SAP. Il saisit le sujet, son niveau et son objectif ; l'outil construit le programme, organise ses supports et le fait progresser jusqu'à l'objectif.

## Utilisateurs cibles

L'outil est un produit destiné à des apprenants externes, pas un outil personnel. Son concepteur en est le premier utilisateur et sert de persona de référence.

**Persona principal : l'apprenant en formation intensive**

- **Situation** : doit monter en compétences vite sur un domaine qu'il ne connaît pas.
- **Durée** : variable, fixée par l'apprenant à chaque formation.
- **Ressources** : dispose souvent de supports hétérogènes (PDF, vidéos, notes), parfois d'aucun.
- **Objectifs**, un ou plusieurs par formation : être opérationnel, réussir un examen ou une certification, dialoguer avec des experts, livrer un projet.

Le type d'objectif oriente la formation : un examen appelle des examens blancs, un projet un livrable, un objectif opérationnel des mises en situation.

## Les quatre piliers

Chaque frein a une réponse dédiée dans le produit. La mémorisation repose sur le quiz global, la pratique sur quatre types d'activités.

| Frein | Réponse de l'outil | Fonctionnalités concernées |
| --- | --- | --- |
| Informations dispersées | Rassembler les ressources par module et les fondre en un cours unique et progressif | Configuration, import de ressources, cours structurés |
| Mémorisation fragile | Rappel actif, répétition espacée, entrelacement et jeux de mémorisation, quel que soit le domaine | Quiz, quiz global, jeux de mémorisation, fiches « À retenir » |
| Manque de pratique | Exercices, mises en situation et projet corrigés par le tuteur | Exercices pratiques, mises en situation, projet fil rouge, examens blancs |
| Irrégularité | Programme sous forme d'agenda, suivi de la progression, relances adaptées | Programme, rappels, tableau de progression |

## Principe directeur : une application pilotée par le tuteur IA

Le tuteur IA porte environ 80 % de l'intelligence fonctionnelle ; le code fournit le socle technique. Ce choix évite de coder une logique métier rigide pour chaque situation pédagogique.

L'application met à disposition des briques. Le tuteur décide lesquelles générer, quand, et comment les organiser.

| Brique | Ce que le tuteur génère | Ce que l'application fait |
| --- | --- | --- |
| Parcours | Modules, objectifs pédagogiques, ordre | Enregistre et affiche le programme |
| Planning | Calendrier des activités | Affiche l'agenda |
| Cours | Cours Markdown structuré à partir des apports | Stocke et affiche le cours |
| Quiz | QCM et questions ouvertes, chacun avec un objectif visé | Fait passer le quiz, enregistre les réponses |
| Exercice | Consigne et critères de réussite | Recueille la production de l'apprenant |
| Évaluation | Analyse des résultats, lacunes, axes prioritaires | Conserve l'historique |
| Révision (quiz global) | Questions sur les notions dues, de tous les modules passés | Calcule les échéances par répétition espacée et tient le quiz global à jour |
| Rappel | Message, moment, objet | Envoie la notification |

Le jeu de briques est fixe. Le tuteur crée de nouvelles activités en les assemblant : une mise en situation réunit une consigne, un échange avec le tuteur et des critères de réussite ; un examen blanc réunit un quiz, une durée limite et une note. Un nouveau type de brique demande du code.

Le détail des trois niveaux de briques est dans l'onglet Catalogue de briques.

Le code reste responsable des fondations : comptes, stockage, sécurité, notifications, fichiers, validation des formats, exécution des actions.

Chaque brique suit le même cycle :

1. Le tuteur produit la brique dans le format défini pour son type.
2. L'application la valide ; une brique non conforme est renvoyée au tuteur avec l'erreur.
3. L'application l'enregistre et la présente à l'apprenant.
4. Les actions et résultats de l'apprenant reviennent au tuteur, qui décide de la suite.

## Déroulé d'une formation

L'apprenant passe par six écrans, de l'accueil à la validation de chaque module. Un module ne se débloque qu'après validation du quiz du module précédent.

| Écran | Ce que voit l'apprenant | Ce qu'il fait | Rôle du tuteur |
| --- | --- | --- | --- |
| Accueil | Ses formations dans un tableau : titre, progression, prochaine activité, dates | Reprend une formation ou en démarre une nouvelle | — |
| Nouvelle formation | Une fenêtre de dialogue avec le tuteur | Saisit le nom de la formation, puis répond aux questions | Pose au plus 5 questions ciblées, choisies selon la formation : périmètre, modules, niveau visé, volume de formation |
| Programme de formation | Le programme en modules et chapitres, le calendrier et l'avancement de chaque module | Importe son propre programme, ou valide celui proposé ; ensuite, y ouvre chaque module | Sans programme fourni : analyse besoins et objectifs, recherche sur le web, propose un programme adapté |
| Module | Les chapitres et, pour chacun, les apports déposés | Dépose ses idées, brouillons, audio, vidéos, PDF ; signale qu'il a terminé | Organise les apports en un cours Markdown complet, clair et progressif |
| Cours | Le cours du module, chapitre par chapitre, avec ses sources | Le relit, pose ses questions au tuteur | Répond dans une discussion qui reçoit le contexte (chapitre, passage sélectionné, apports, lacunes) et cite ses sources |
| Quiz de validation | Le quiz du module, puis le résultat et les lacunes détectées | Passe le quiz, autant de fois que nécessaire | Tire de nouvelles questions d'une banque préparée à l'avance et analyse les erreurs |

Les questions de cadrage ne sont pas fixes : le tuteur les choisit pour cerner le besoin propre à chaque formation.

Les écrans sont maquettés en prototype cliquable, sur l'exemple d'une formation SAP S/4HANA Finance, dans le dossier local `maquettes` du projet : sa page d'entrée est `index.html`.

**Navigation dans l'application**

- **En-tête figé**, sur tous les écrans : recherche (notions, cours, formations), notifications et menu « Mon compte », qui donne accès aux Paramètres et à la déconnexion.
- **Centre de notifications** : la cloche indique le nombre de notifications non lues et ouvre leur liste, groupée par jour (aujourd'hui, hier, plus tôt) et filtrable (toutes ou non lues). Chaque notification montre son type (quiz à venir, cours prêt, quiz global du jour, nouvelle lacune, séance prévue, module validé), sa formation et son heure, et mène à l'écran concerné ; « Tout marquer comme lu » vide le compteur. Les réglages (canaux, types de notification, heures calmes) sont dans Paramètres, onglet Notifications.
- **Menu latéral en deux zones** : d'abord la navigation générale (Accueil, Agenda commun à toutes les formations), puis la section « Formation en cours ». Celle-ci montre la formation (progression, module en cours), permet d'en changer et donne accès au Programme, à la Carte des notions, au Quiz global et à Mes lacunes.
- **Accès aux modules par le Programme** : chaque module s'ouvre depuis le programme, avec ses apports, son cours et son quiz de validation ; un fil d'Ariane y ramène. Un module verrouillé indique ce qui le débloquera.
- **Carte des notions** : un graphe de toutes les notions de la formation, regroupées autour de leur module. Les traits relient une notion à celles qui la préparent ; en orange, les notions que l'apprenant confond ; en pointillé, les liens que le tuteur repère entre modules ; en option, les apports qui alimentent chaque notion. Couleurs par module ou par maîtrise. Un clic sur une notion affiche sa maîtrise, ses liens et mène au cours, à l'entraînement ou à la lacune.
- **Discussion avec le tuteur** : depuis le cours, un panneau s'ouvre à côté du texte. Il affiche le contexte transmis (formation, chapitre en lecture, passage sélectionné, apports, lacune suivie, profil), que l'apprenant peut ajuster. On l'ouvre par la carte « Demander au tuteur », par un bouton placé à côté d'un passage, ou en sélectionnant du texte.
- **Menu masquable** : l'apprenant peut masquer complètement le menu latéral pour se concentrer ; son choix est mémorisé.
- **Série de régularité** : le nombre de jours d'étude consécutifs et la régularité sur les 14 derniers jours restent visibles en bas du menu.

Une formation se caractérise par son titre, sa description, son volume de formation, ses dates, son calendrier et surtout son programme. Le programme est organisé en modules, ou thématiques, eux-mêmes divisés en chapitres. L'apprenant se forme avec des ressources externes, souvent en ligne, puis dépose dans chaque chapitre ce qu'il en a retenu.

**Cycle d'un module**

&#91;embedded content: cycle d'un module · 6 étapes, 1 boucle de remédiation\]

Le tuteur construit le cours à partir des apports déposés dans chaque chapitre ; sans apport, il rédige un cours de base signalé comme tel. Les révisions et les rappels couvrent toute la formation, pas un seul module.

**En continu : le quiz global**

Un quiz global, toujours accessible, mêle des questions sur tous les modules déjà étudiés de la formation, y compris ceux vus il y a deux mois ou plus. Il se met à jour à mesure que l'apprenant avance :

- chaque module terminé y ajoute ses notions ;
- l'algorithme de répétition espacée sélectionne les notions dont le souvenir risque de s'effacer, quel que soit leur module ;
- le tuteur rédige les questions et en varie la forme, pour tester la notion plutôt que le souvenir d'une réponse ;
- une erreur ramène la notion plus tôt, une réussite l'espace davantage.

Le quiz global est la forme visible des révisions espacées : les rappels de révision y renvoient.

## Identification des lacunes

Repérer précisément les lacunes est une exigence centrale : elles orientent chaque tentative, chaque remédiation et le quiz global, tout au long de la formation.

**Ce qui est enregistré**

- Chaque tentative de quiz est conservée : réponses, justesse, temps, score par notion.
- Chaque question cible une notion. Le niveau de maîtrise d'une notion se calcule sur toutes ses réponses, les plus récentes comptant davantage.

**Quand une notion devient une lacune**

- Son niveau de maîtrise reste sous le seuil après une tentative.
- Ou la même erreur revient d'une tentative à l'autre.

**Nature de la lacune et réponse du tuteur**

| Nature | Signe | Réponse du tuteur |
| --- | --- | --- |
| Oubli | La notion était réussie, puis échoue avec le temps | Révision par le quiz global |
| Confusion | La réponse donnée correspond à une autre notion | Question qui oppose les deux notions, comparaison côte à côte |
| Incompréhension | Erreurs répétées, réponses ouvertes à côté du sujet | Nouvelle explication, sous un autre angle |
| Difficulté d'application | Définitions justes, exercices échoués | Exercice pratique ou mise en situation |

**Où les lacunes servent**

- **Tentative suivante** : nouvelles questions, centrées sur les notions en lacune.
- **Remédiation** : contenu ciblé avant une nouvelle tentative.
- **Quiz global** : les lacunes passent en priorité, même des mois après le module.
- **Apprenant** : une page « Mes lacunes », propre à chaque formation, liste les notions à consolider avec leur nature, leur niveau de maîtrise et la prochaine révision ; elle se filtre par nature et lance un entraînement ciblé.

## Mémorisation : une priorité transversale

Le tuteur vise la rétention durable, quelle que soit la formation : chaque cours, quiz et jeu est conçu pour que l'apprenant retienne, pas seulement pour qu'il comprenne. Il s'appuie sur des techniques éprouvées en sciences cognitives.

| Technique | Principe | Mise en œuvre dans l'outil |
| --- | --- | --- |
| Rappel actif | Chercher la réponse de tête fixe mieux que relire | Quiz, cartes de rappel, textes à trous : l'apprenant produit avant de voir la réponse |
| Répétition espacée | Revoir juste avant d'oublier | Quiz global, dates fixées par l'algorithme |
| Entrelacement | Mêler les notions oblige à choisir la bonne | Questions qui mélangent des notions de modules différents |
| Élaboration | Relier, expliquer le pourquoi et le comment | Questions « pourquoi ? », résumé du chapitre par l'apprenant |
| Double codage | Le mot et l'image se renforcent | Schéma dans la fiche « À retenir » de chaque chapitre |
| Retour immédiat | Une erreur corrigée tout de suite ne s'installe pas | Explication affichée après chaque réponse |
| Moyens mnémotechniques | Un repère facilite le rappel d'une liste ou d'un ordre | Proposés par le tuteur pour les listes, étapes et chiffres clés |

**Jeux de mémorisation**

Les jeux sont des formes de rappel actif, pas des récompenses. Ils valent pour tout domaine : le tuteur choisit le format selon le type de notion.

| Jeu | Ce que fait l'apprenant | Type de notion visé |
| --- | --- | --- |
| Carte de rappel | Cherche la réponse de tête, retourne la carte, s'auto-évalue | Définition, fait, chiffre clé |
| Texte à trous | Complète les mots clés masqués, sans liste de choix | Vocabulaire, formulation exacte |
| Association | Relie des paires : terme et définition, cause et effet | Notions proches, risque de confusion |
| Remise en ordre | Replace des étapes mélangées | Procédure, chronologie |
| Classement | Range des éléments dans des catégories | Typologie, comparaison |
| Explique à un débutant | Explique une notion au tuteur, qui joue un novice | Concept à comprendre en profondeur |

**Règles du tuteur**

- Tester avant de réexpliquer : face à une lacune, il pose d'abord une question, puis explique.
- Varier le format d'une même notion d'une fois sur l'autre.
- Terminer chaque chapitre du cours par une fiche « À retenir » : points clés, schéma, moyen mnémotechnique si utile.
- Demander à l'apprenant de résumer chaque chapitre avec ses mots, puis corriger le résumé.

**Récompenses et indicateur**

- Les points et les séries récompensent la régularité et la rétention dans le temps, jamais la seule vitesse.
- Indicateur principal de l'apprenant : la part des notions encore retenues un mois et deux mois après leur module.

## Automatismes

Entre deux séances, le tuteur agit seul pour limiter le décrochage et renforcer la mémoire. Chaque automatisme se règle dans Paramètres, onglet Automatismes ; les valeurs par défaut sont entre parenthèses. Tous sont en V1.

| Automatisme | Déclencheur et action | Réglages (défaut) |
| --- | --- | --- |
| 1. Reprise après décrochage | Séance manquée : replacée dans une marge. Plusieurs jours sans activité : reprise de 5 min proposée, puis allègement du programme ou fin décalée | Reprise après (2 jours), allègement après (5 jours), séances replacées automatiquement ou sur accord (sur accord) |
| 2. Micro-séance de secours | Séance du jour non faite le soir : version courte, cartes de rappel et une question, pour garder le rythme et la série | Heure (20:00), durée (5 min) |
| 3. Échauffement de début de séance | Chaque séance s'ouvre sur quelques questions de rappel : notions de la veille et prérequis du chapitre, tirés de la carte des notions | Nombre de questions (3), portée (la veille et les prérequis) |
| 4. Remédiation après un quiz raté | Score sous le seuil : remédiation ciblée sur les lacunes, tentative suivante planifiée après un délai pour éviter les réponses au hasard | Délai (24 h), remédiation conseillée ou obligatoire (conseillée) |
| 5. Jeu choisi selon la lacune | Confusion : association ou classement qui oppose les deux notions. Oubli : cartes de rappel. Difficulté d'application : exercice | Préférence de jeux (varier) |
| 6. Questions transformées en cartes | Question posée au tuteur : carte de rappel, révisée à intervalles espacés | Avec confirmation ou automatique (avec confirmation) |
| 7. Quiz global plafonné et lissé | Trop de notions dues le même jour : révision étalée sur les jours suivants, lacunes en tête | Durée maximale par jour (15 min), taux de mémorisation visé (90 %) |
| 8. Sprint avant un jalon | Avant un quiz de validation ou un examen blanc : révisions courtes sur les notions les plus faibles du module | Début (3 jours avant) |
| 9. Bilan de la semaine | Chaque semaine : progression, mémorisation, notions à risque, plan de la semaine suivante et mise à jour des disponibilités | Jour et heure (dimanche 19:00), canal (application) |
| 10. Mode pause et retour | Pause déclarée : planning gelé sans casser la série. Au retour : court diagnostic sur les notions à risque, puis replanification | Date de fin, diagnostic au retour (activé) |

**Garde-fous**

- Les heures calmes et un nombre maximal de notifications par jour (5) s'appliquent à tous les automatismes.
- Les grands changements de planning (alléger le programme, décaler la fin) attendent toujours l'accord de l'apprenant.
- Chaque action est expliquée en une ligne et peut être annulée ; un journal de la semaine les récapitule.

## Fonctionnalités

44 fonctionnalités en 11 modules. Les priorités sont une proposition à valider : la V1 couvre une formation complète à partir de PDF et de textes ; l'audio et la vidéo arrivent en V2.

| Module | Fonctionnalité | Priorité |
| --- | --- | --- |
| Accueil | Tableau des formations suivies : titre, progression, prochaine activité ; reprise ou nouvelle formation | V1 |
| Navigation | En-tête figé (recherche, notifications, compte et paramètres) ; menu latéral masquable en deux zones : navigation générale, puis formation en cours (programme, quiz global, lacunes) | V1 |
| Configuration | Saisie du nom de la formation | V1 |
| Configuration | Cadrage par chat : au plus 5 questions ciblées, choisies par le tuteur selon la formation | V1 |
| Configuration | Import d'un programme de formation existant | V1 |
| Configuration | Programme proposé par le tuteur après analyse des besoins et recherche web | V1 |
| Configuration | Validation du programme par l'apprenant avant démarrage | V1 |
| Programme | Fiche formation : titre, description, volume, dates, calendrier | V1 |
| Programme | Programme en modules (thématiques) et chapitres ; activités datées dans un agenda commun à toutes les formations, filtrable par formation | V1 |
| Programme | Réajustement du planning : options proposées par le tuteur si un module reste bloqué | V1 |
| Apports et ressources | Dépôt d'apports par chapitre : idées et brouillons, texte brut ou structuré | V1 |
| Apports et ressources | Import de PDF rattachés à un chapitre | V1 |
| Apports et ressources | Suggestion de ressources à importer, trouvées sur le web | V1 |
| Apports et ressources | Import audio avec transcription automatique | V2 |
| Apports et ressources | Import vidéo avec transcription | V2 |
| Apports et ressources | Import d'une page web par son adresse, citée en source | V1 |
| Apports et ressources | Import des sous-titres d'une vidéo YouTube, cités avec leur minutage | V1 |
| Apports et ressources | Import d'images et de captures (notes manuscrites, écrans), lues automatiquement | V1 |
| Cours | Cours Markdown par module, organisé par chapitre, dans une logique progressive | V1 |
| Cours | Cours de base rédigé par le tuteur si un chapitre n'a aucun apport, signalé comme tel | V1 |
| Cours | Lien de chaque notion vers ses sources | V1 |
| Cours | Détection des liens entre ressources et entre modules | V2 |
| Cours | Carte des notions : graphe des notions et de leurs liens (prérequis, confusions, liens repérés par le tuteur, apports), coloré par module ou par maîtrise | V1 |
| Quiz et évaluation | Quiz de validation par module : QCM corrigés automatiquement, questions ouvertes corrigées par le tuteur | V1 |
| Quiz et évaluation | Déblocage du module suivant uniquement si le quiz est validé | V1 |
| Quiz et évaluation | Tentatives illimitées, toutes enregistrées, nouvelles questions tirées d'une banque préparée à l'avance | V1 |
| Quiz et évaluation | Identification des lacunes et de leur nature, sur toutes les tentatives | V1 |
| Quiz et évaluation | Remédiation ciblée sur les lacunes avant une nouvelle tentative | V1 |
| Quiz et évaluation | Page « Mes lacunes » par formation : notions à consolider, filtrables par nature, avec maîtrise, prochaine révision et entraînement ciblé | V1 |
| Quiz et évaluation | Quiz global continu, propre à chaque formation : questions sur tous ses modules passés, lacunes en priorité | V1 |
| Quiz et évaluation | Révisions espacées : dates calculées par un algorithme (par exemple FSRS), questions choisies par le tuteur | V1 |
| Mémorisation | Jeux de mémorisation : cartes de rappel, textes à trous, association, remise en ordre, classement | V1 |
| Mémorisation | « Explique à un débutant » : l'apprenant explique une notion au tuteur, qui joue un novice | V2 |
| Mémorisation | Fiche « À retenir » en fin de chapitre : points clés, schéma, moyen mnémotechnique | V1 |
| Mémorisation | Résumé de chaque chapitre par l'apprenant, corrigé par le tuteur | V1 |
| Mémorisation | Entrelacement : questions mêlant des notions de modules différents | V1 |
| Mémorisation | Retour immédiat : explication affichée après chaque réponse | V1 |
| Mémorisation | Série de jours et jalons sobres (module validé, 100 notions retenues, 30 jours de série), sans classement | V1 |
| Mémorisation | Indicateur de rétention : part des notions retenues à un mois et à deux mois | V1 |
| Pratique | Exercices pratiques corrigés par le tuteur | V1 |
| Pratique | Mises en situation jouées avec le tuteur | V2 |
| Pratique | Projet fil rouge évalué en fin de formation | V2 |
| Pratique | Examens blancs au format officiel quand il est connu (durée, nombre de questions, barème), sinon chronométrés, sans aide et corrigés à la fin | V1 |
| Engagement | Rappels personnalisés par e-mail et notification du navigateur : révisions, quiz, sessions | V1 |
| Engagement | Centre de notifications dans l'application : non lues comptées, liste groupée par jour et filtrable, lien vers l'écran concerné ; réglages par canal, par type et heures calmes | V1 |
| Engagement | Détection fine de la baisse d'engagement (justesse qui chute, réponses trop rapides) et pause proposée | V2 |
| Engagement | Dix automatismes réglables (voir la section Automatismes) : reprise après décrochage, micro-séance, échauffement, remédiation, jeu selon la lacune, questions en cartes, quiz global plafonné, sprint avant un jalon, bilan de la semaine, mode pause ; journal des actions, chacune annulable | V1 |
| Engagement | Tableau de progression | V1 |
| Engagement | Formations à plusieurs : programme et agenda communs, progression et série visibles entre membres ; apports, cours, notes et lacunes restent privés | V1 |
| Programme | Trois formations actives au plus ; au-delà, une formation est mise en pause | V1 |
| Programme | Bilan final de formation, avec le choix de garder un entretien de mémoire léger ou d'arrêter les révisions | V1 |
| Tuteur | Discussion avec le tuteur, ouverte depuis le cours avec un contexte défini et modifiable (formation, chapitre en lecture, passage sélectionné, apports, lacunes, profil) : réponses sourcées, autre explication, exemple, auto-test | V1 |
| Coûts IA | Plafond de dépense IA par apprenant et par jour, avec alerte | V1 |
| Coûts IA | Suivi des tokens et du coût de chaque appel, agrégé par formation | V1 |
| Coûts IA | Gratuit avec sa propre clé d'IA ; IA fournie payante ; au plafond quotidien, bascule sur un modèle moins cher jusqu'au lendemain | V1 |
| Compte | Connexion par lien magique ou par mot de passe ; ton du tuteur réglable (vouvoiement par défaut) ; cours rédigés dans la langue de l'apprenant | V1 |
| Compte | Export de toutes les données ; suppression du compte après 30 jours, annulable entre-temps | V1 |
| Plateforme | Application web installable ; quiz global et cartes de rappel jouables hors ligne, synchronisés au retour du réseau | V1 |

## Exigences transverses

La confiance dans les contenus générés est l'exigence centrale : l'apprenant doit savoir d'où vient chaque information.

- **Traçabilité** : chaque notion d'un cours renvoie aux passages des ressources dont elle provient. Ce qui vient des connaissances propres du tuteur est signalé comme tel.
- **Contrôle par l'apprenant** : il peut corriger, compléter ou rejeter ce que le tuteur génère (parcours, cours, questions).
- **Formats garantis** : chaque type de brique a un format défini ; l'application refuse toute brique non conforme.
- **Données personnelles** : les ressources importées restent privées à leur propriétaire. Le produit respecte le RGPD.
- **Coût de l'IA** : l'IA n'est appelée que lorsque le code ne suffit pas ; cours et questions sont générés une fois puis réutilisés ; chaque appel est plafonné et son coût enregistré par formation. Le détail des leviers est dans l'onglet Architecture technique.

## Décisions prises et questions ouvertes

Toutes les décisions de fond sont actées ; il reste à vérifier la marque Learny et son nom de domaine.

**Décisions prises**

| Sujet | Décision |
| --- | --- |
| Domaine | Tout domaine : l'outil n'est spécialisé dans aucun sujet |
| Forme | Application structurée avec un tuteur IA intégré, chat dès la configuration |
| Rythme | Formation intensive, durée fixée par l'apprenant |
| Objectifs | Opérationnel, examen, dialogue avec des experts, projet ; combinables |
| Contenu | Ressources de l'apprenant et connaissances du tuteur |
| Cible | Produit pour des utilisateurs externes : particuliers d'abord, entreprises plus tard |
| Architecture | Le tuteur porte environ 80 % de l'intelligence fonctionnelle |
| Recherche web | Sert à concevoir le parcours et à suggérer des ressources ; les cours restent fondés sur les ressources importées |
| Module sans ressource | Le tuteur rédige un cours de base, signalé comme issu de ses connaissances, et suggère des ressources à importer |
| Pratique | Exercices pratiques, mises en situation, projet fil rouge et examens blancs, choisis selon l'objectif ; exercices et examens blancs en V1, le reste en V2 |
| Briques | Un jeu fixe de briques élémentaires que le tuteur assemble librement ; un nouveau type de brique demande du code |
| Révisions | Un algorithme de répétition espacée (par exemple FSRS) fixe les dates ; le tuteur choisit quoi réviser et sous quelle forme |
| Quiz global | Un quiz continu propre à chaque formation, sur tous ses modules passés, mis à jour selon la progression de l'apprenant |
| Plateforme | Web d'abord, sur ordinateur et mobile ; rappels par e-mail et notifications du navigateur ; application web installable, quiz global et cartes de rappel jouables hors ligne |
| Cadrage | Au plus 5 questions, choisies par le tuteur selon la formation |
| Programme | Modules (thématiques) divisés en chapitres ; l'apprenant dépose ses apports par chapitre |
| Cours | Rédigé par le tuteur en Markdown à partir des apports, dans une logique progressive |
| Déblocage | Le module suivant ne s'ouvre qu'après validation du quiz ; tentatives illimitées, toutes enregistrées |
| Lacunes | Identifiées sur toutes les tentatives et suivies par formation, elles orientent les tentatives suivantes, la remédiation et le quiz global |
| Mémorisation | Priorité transversale : techniques éprouvées et jeux de mémorisation, quel que soit le domaine |
| Seuil de validation | 80 % par défaut, ajusté par le tuteur selon l'objectif de la formation |
| Calendrier | Si un module reste bloqué, le tuteur propose des options (décaler la fin, augmenter le volume quotidien, alléger le programme) ; l'apprenant choisit |
| Modèles d'IA | Configurables par chaque utilisateur, tâche par tâche, avec sa propre clé ; Claude par défaut |
| Hébergement | Supabase Cloud en région UE en V1, auto-hébergeable plus tard ; jobs avec Inngest |
| Navigation | Menu en deux zones : navigation générale (Accueil, Agenda commun à toutes les formations et filtrable), puis section de la formation en cours (Programme, Carte des notions, Quiz global, Mes lacunes). Modules ouverts depuis le Programme ; Paramètres dans « Mon compte » ; en-tête figé et menu masquable |
| Automatismes | Dix automatismes en V1, réglables dans les paramètres, avec garde-fous : heures calmes, plafond de notifications, accord de l'apprenant pour les grands changements de planning, actions annulables |
| Nom | Learny ; marque et nom de domaine à vérifier |
| Modèle économique | Gratuit avec sa propre clé d'IA ; payant pour utiliser l'IA fournie |
| Plafond IA | Au plafond quotidien, le tuteur bascule sur un modèle moins cher jusqu'au lendemain ; révisions et contenus déjà générés restent disponibles |
| Connexion | E-mail avec lien magique, ou e-mail et mot de passe |
| Langues | Interface en français en V1 ; le tuteur rédige dans la langue de l'apprenant, quelle que soit celle des ressources |
| Ton du tuteur | Vouvoiement par défaut, tutoiement possible dans le profil ; toujours bienveillant et exigeant |
| Apports | PDF, textes et notes, pages web, sous-titres de vidéos YouTube, images et captures en V1 ; audio et vidéo en fichier en V2 |
| Examen blanc | Reproduit le format officiel quand il est connu (durée, nombre de questions, barème) ; sinon chronométré, sans aide, corrigé à la fin |
| Fin de formation | Bilan final ; l'apprenant choisit de garder un entretien de mémoire léger ou d'arrêter les révisions |
| Formations en parallèle | Trois formations actives au plus ; au-delà, une formation doit être mise en pause |
| Formations à plusieurs | En V1 : programme et agenda communs ; chacun voit la progression et la série des autres, jamais leurs notes ni leurs lacunes ; apports et cours restent privés |
| Gamification | Série de jours et jalons sobres (module validé, 100 notions retenues, 30 jours de série) ; pas de classement |
| Données | Export libre de tout (cours en Markdown, apports, résultats) ; suppression du compte après 30 jours, annulable entre-temps |
| Modèle personnel défaillant | Si le modèle branché par l'utilisateur produit des briques invalides, la tâche s'arrête et il est prévenu ; il choisit la suite |
| Périmètre | La V1 sort telle que définie, sans version intermédiaire réduite |
| Prototype | Test sur la formation SAP S/4HANA Finance |

**Questions ouvertes**

Aucune question de fond ne reste ouverte. À vérifier : la disponibilité de la marque Learny et de son nom de domaine.

## Prochaines étapes

Les décisions de fond sont prises ; la suite porte sur les maquettes, l'architecture technique et un premier test.

- [x] Trancher les questions ouvertes de la spec et du catalogue
- [x] Valider les priorités V1 et V2 des fonctionnalités
- [ ] Tester sur SAP S/4HANA Finance : suivi FSRS par notion, découpage des notions
- [x] Maquetter les six écrans : accueil, nouvelle formation, programme, module, cours, quiz
- [x] Choisir la plateforme et l'architecture technique : Architecture technique
- [x] Maquetter l'inscription et les premiers pas
- [x] Maquetter l'exercice pratique et l'examen blanc
- [ ] Vérifier la marque Learny et le nom de domaine
