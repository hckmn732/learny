# Catalogue des règles métier

Chaque règle porte un identifiant stable `BR-<DOMAINE>-<NN>`. **Toute spécification qui implémente une règle la cite** dans sa section « Règles métier couvertes ». L'outil `node tools/sdd/audit.mjs` vérifie que chaque règle est couverte par au moins une spécification.

Colonnes : identifiant · règle (normative : « doit ») · priorité (V1/V2) · source (`L` = spécification legacy, `M` = maquettes, `ADR-xxxx` = décision du registre).

Valeurs par défaut et bornes : elles sont **normatives**. Une valeur absente ici est fixée dans la spécification concernée ou dans un ADR, jamais laissée à l'appréciation de l'implémenteur.

---

## ACC — Compte, profil, onboarding

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-ACC-01 | L'inscription et la connexion se font par e-mail avec **lien magique** (valable 1 heure, usage unique) ou par **e-mail + mot de passe** (12 caractères minimum, sans autre contrainte de composition ; indicateur de solidité affiché). | V1 | L, M, ADR-0007 |
| BR-ACC-02 | L'inscription exige l'acceptation explicite des CGU et de la politique de confidentialité (case à cocher non pré-cochée). La date et la version acceptées sont enregistrées. | V1 | M, ADR-0045 |
| BR-ACC-03 | L'adresse e-mail doit être vérifiée (lien de confirmation, ou lien magique) avant tout accès à l'application. Le lien peut être renvoyé ; un nouvel envoi n'est possible que 60 secondes après le précédent. | V1 | M |
| BR-ACC-04 | Après vérification, l'onboarding « Premiers pas » enchaîne : Profil → Rythme → IA → Rappels → Départ. Il est reprenable à l'étape où l'utilisateur l'a quitté. L'application n'est accessible qu'une fois l'étape IA franchie. | V1 | M |
| BR-ACC-05 | Ton du tuteur : **vouvoiement** par défaut, **tutoiement** possible (profil). Le ton s'applique à tout texte rédigé par le tuteur (cours, discussion, corrections, messages des notifications et automatismes). Les libellés fixes de l'interface restent au vouvoiement. | V1 | L, ADR-0010 |
| BR-ACC-06 | Interface en **français uniquement** en V1. Langue des cours au choix (fr, en, es, de ; défaut fr) : le tuteur rédige dans cette langue quelle que soit la langue des ressources. | V1 | L, ADR-0009 |
| BR-ACC-07 | Chaque utilisateur a un fuseau horaire (IANA ; défaut détecté par le navigateur, sinon `Europe/Paris`). Toutes les dates et heures affichées, planifiées et envoyées le sont dans ce fuseau. | V1 | ADR-0030 |
| BR-ACC-08 | Rythme d'étude : heures par jour (entier 1 à 6, défaut 2 à l'onboarding), jours d'étude (au moins 1 ; défaut lundi à vendredi), moments préférés (au moins 1 parmi matin 08:00-12:00, après-midi 13:00-18:00, soir 18:00-22:00 ; défaut soir). Ce rythme est la valeur par défaut des nouvelles formations. | V1 | M |
| BR-ACC-09 | « Se déconnecter » (menu Mon compte) ferme la session et mène à l'écran de connexion. | V1 | M |
| BR-ACC-10 | Export de toutes les données à tout moment : archive ZIP contenant cours (Markdown), apports originaux, résultats et réglages (JSON), prête en moins de 15 minutes, lien de téléchargement valable 7 jours, notifié par e-mail. | V1 | L, ADR-0044 |
| BR-ACC-11 | Suppression du compte : effective **30 jours** après la demande ; annulable jusque-là (bouton dans Paramètres, ou simple reconnexion qui propose l'annulation) ; à J+30 toutes les données personnelles et fichiers sont effacés définitivement ; un e-mail confirme la demande et la suppression. | V1 | L, ADR-0044 |
| BR-ACC-12 | Le profil comporte : prénom, nom, e-mail (non modifiable en V1), langue des cours, ton du tuteur, fuseau horaire, rythme d'étude. | V1 | M |

## IA — Modèles, clés, coûts, abonnement

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-IA-01 | Modèles par défaut (IA fournie) par tâche : conception du programme, rédaction du cours, analyse des lacunes → `claude-opus-5-5` ; tuteur, génération de questions et de jeux, correction → `claude-sonnet-5-5` ; tâches légères (classification, découpage, variantes simples) → `claude-haiku-5-5`. Les identifiants sont centralisés dans un fichier de configuration. | V1 | L, ADR-0018 |
| BR-IA-02 | Chaque utilisateur peut, **tâche par tâche**, remplacer le modèle par celui d'un fournisseur de son choix (Anthropic, OpenAI, Mistral, DeepSeek, service compatible OpenAI, modèle local) avec **sa propre clé**. Un modèle n'est activable qu'après **qualification** réussie : connexion, appel d'outils, sortie structurée, production valide d'une brique de chaque type. | V1 | L, M |
| BR-IA-03 | Les clés d'API des utilisateurs sont chiffrées au repos (AES-256-GCM), jamais renvoyées au navigateur, affichées masquées (`sk-••••••••` + 4 derniers caractères), supprimables à tout moment. | V1 | L |
| BR-IA-04 | Un avertissement « Traite les données hors de l'Union européenne » s'affiche pour tout fournisseur hors UE. | V1 | L, M |
| BR-IA-05 | Si le modèle personnel produit une brique invalide après 2 corrections automatiques, la tâche s'arrête, l'utilisateur est notifié et choisit : autre modèle de sa clé, ou IA fournie (si abonné). Aucune bascule automatique vers l'IA payante. | V1 | L, ADR-0013 |
| BR-IA-06 | Modèle économique : l'outil est **gratuit avec sa propre clé** ; l'**IA fournie** nécessite un abonnement mensuel payant (Stripe). Sans abonnement actif ni clé qualifiée pour une tâche, les fonctions IA de cette tâche sont indisponibles (message explicite + lien vers Paramètres) ; tout ce qui ne demande pas d'IA (révisions, quiz déjà générés, agenda) reste disponible. | V1 | L, ADR-0011 |
| BR-IA-07 | Plafond quotidien de dépense de l'IA fournie par apprenant : 1,50 USD par jour (réglable par l'exploitant via configuration). Alerte in-app à 80 %. Au plafond, toutes les tâches basculent sur `claude-haiku-5-5` jusqu'à minuit (fuseau de l'utilisateur). Les tâches qui exigent un modèle supérieur et ne peuvent être faites par Haiku (conception du programme) sont reportées au lendemain avec notification. | V1 | L, ADR-0012 |
| BR-IA-08 | Chaque appel IA est journalisé : utilisateur, formation, tâche, fournisseur, modèle, tokens d'entrée/sortie/cache, coût estimé (USD), latence, statut, mode lot ou non. Les coûts sont agrégés par formation et par jour. | V1 | L |
| BR-IA-09 | L'IA n'est appelée que lorsque le code ne suffit pas : questions à choix, jeux, dates de révision, scores, déblocages et tirages sont calculés par le code. | V1 | L |
| BR-IA-10 | Le contenu des apports est toujours transmis au modèle comme **donnée** balisée, jamais comme instruction ; une instruction trouvée dans un apport est ignorée. | V1 | L, ADR-0023 |
| BR-IA-11 | Toute brique produite par un modèle est validée par son schéma et les règles communes (BR-BRI-*). Une brique invalide est renvoyée au modèle avec l'erreur, au plus 2 fois, avant échec de la tâche. | V1 | L |
| BR-IA-12 | La recherche web ne sert qu'à concevoir le programme et à suggérer des ressources ; son résultat n'entre jamais tel quel dans un cours. | V1 | L |
| BR-IA-13 | Le contexte stable d'une formation (instructions, outils, programme) est mis en cache côté fournisseur quand c'est possible ; les générations non urgentes (banques de questions) passent par l'API de traitement par lots. | V1 | L, ADR-0019 |

## FOR — Formation, cadrage, programme

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-FOR-01 | Créer une formation commence par la saisie de ce que l'apprenant veut apprendre (1 à 120 caractères), puis un **cadrage par chat** : le tuteur pose **au plus 5 questions**, choisies selon la formation, avec réponses libres et/ou suggestions cliquables. | V1 | L, M |
| BR-FOR-02 | Pendant le cadrage, un panneau « Profil de la formation » montre l'avancement (n/5) et cinq rubriques : périmètre, point de départ, niveau visé, volume de formation, dates et calendrier ; chacune est « À préciser », « En attente de votre réponse » ou renseignée. « Générer le programme » est actif dès que périmètre et niveau visé sont renseignés. | V1 | M |
| BR-FOR-03 | Une formation a un ou plusieurs objectifs parmi : opérationnel, examen ou certification, dialogue avec des experts, projet. | V1 | L |
| BR-FOR-04 | Le programme est soit **proposé** par le tuteur (analyse du cadrage + recherche web), soit **importé** (fichier PDF/DOCX/TXT/MD ou texte collé, structuré par le tuteur). L'apprenant peut demander des ajustements en langage naturel (« Ajuster avec le tuteur ») ; il doit **valider** le programme avant le démarrage. | V1 | L, M |
| BR-FOR-05 | Un programme est une liste ordonnée de **modules** (titre, objectifs pédagogiques, dates prévues, seuil de validation), chacun divisé en **chapitres** ordonnés. Chaque chapitre porte une liste de **notions** (intitulé, définition courte). | V1 | L |
| BR-FOR-06 | Seuil de validation d'un module : 80 % par défaut ; le tuteur peut l'ajuster selon l'objectif, entre 60 % et 95 %. | V1 | L, ADR-0014 |
| BR-FOR-07 | Statut d'un module : verrouillé, ouvert (en cours), validé. À la validation du programme, le module 1 est ouvert, les autres verrouillés. Un module s'ouvre quand le quiz de validation du module précédent est réussi. | V1 | L |
| BR-FOR-08 | Un module verrouillé affiche ce qui le débloquera (« Se débloque quand le quiz du module N est validé ») et n'est pas accessible. | V1 | M |
| BR-FOR-09 | Fiche formation : titre, description, objectifs, volume horaire total, date de début, date de fin, rythme (hérité du profil, modifiable), statut. Indicateurs affichés sur le programme : avancement (% de modules validés), durée (semaines), volume (h), seuil. | V1 | L, M |
| BR-FOR-10 | **Trois formations actives au plus** par utilisateur. Créer ou reprendre une 4e exige de mettre en pause une formation active (choix proposé dans un dialogue). | V1 | L |
| BR-FOR-11 | La « formation en cours » (affichée dans le menu) est la dernière formation active consultée ; « Changer de formation » ouvre la liste des formations actives et en pause. | V1 | M |
| BR-FOR-12 | Une formation est **terminée** quand tous ses modules sont validés. Un **bilan final** est alors présenté (acquis, notions fragiles, carte des notions, heures, rétention) avec le choix : garder un **entretien de mémoire léger** (quiz global limité à 5 min/jour, notions dues uniquement) ou **arrêter les révisions**. | V1 | L, ADR-0015 |
| BR-FOR-13 | L'accueil présente les formations en deux onglets : « En cours » (actives et en pause) et « Terminées ». | V1 | M |
| BR-FOR-14 | Si un module reste bloqué (quiz non validé après la dernière marge planifiée, ou retard ≥ 3 jours sur le planning), le tuteur propose trois options : décaler la fin, augmenter le volume quotidien, alléger le programme ; l'apprenant choisit ; rien n'est appliqué sans son accord. | V1 | L |
| BR-FOR-15 | Mettre une formation en pause gèle son planning (ses créneaux futurs sont retirés) ; la reprendre la replanifie à partir du jour de reprise. | V1 | ADR-0016 |
| BR-FOR-16 | Une formation en état « cadrage » ou « programme proposé » apparaît dans l'accueil avec l'action « Continuer » qui ramène à l'étape en cours. | V1 | M |

## APP — Apports et ressources

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-APP-01 | Types d'apports V1, déposés par chapitre : note (idées, brouillon, texte brut ou Markdown), PDF, page web (par URL), vidéo YouTube (par URL ; sous-titres importés avec minutage), image ou capture (lue automatiquement). | V1 | L, ADR-0008 |
| BR-APP-02 | Limites : PDF ≤ 50 Mo et ≤ 500 pages ; image ≤ 10 Mo (JPEG, PNG, WebP, HEIC) ; note ≤ 100 000 caractères ; 100 apports par chapitre ; stockage total ≤ 2 Go par utilisateur. Un dépassement est refusé avec un message explicite. | V1 | ADR-0039 |
| BR-APP-03 | Les apports sont privés à leur propriétaire, y compris dans une formation à plusieurs. | V1 | L |
| BR-APP-04 | Chaque chapitre a un statut d'apports : « en cours » ou « terminé ». L'apprenant déclare un chapitre terminé ; quand tous les chapitres d'un module sont terminés (ou sur demande « Générer le cours maintenant »), la génération du cours est lancée. | V1 | L, M |
| BR-APP-05 | Le tuteur peut suggérer des ressources trouvées sur le web pour un chapitre (titre, URL, raison) ; l'apprenant les importe ou les ignore. | V1 | L |
| BR-APP-06 | Chaque apport est découpé en passages repérés (page pour un PDF, horodatage pour une vidéo, ancre pour une page web, position pour une note) ; ces passages servent aux citations et à la recherche sémantique. | V1 | L |
| BR-APP-07 | Statut de traitement d'un apport : en file, en cours, prêt, échec (avec raison lisible et bouton « Réessayer »). | V1 | M |
| BR-APP-08 | Import audio (fichier) avec transcription automatique. | V2 | L |
| BR-APP-09 | Import vidéo (fichier) avec transcription automatique. | V2 | L |
| BR-APP-10 | Un apport peut être renommé ou supprimé ; sa suppression retire ses passages et marque les citations correspondantes « source supprimée ». | V1 | ADR-0039 |

## COU — Cours

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-COU-01 | Un cours est généré par module, organisé par chapitre, en Markdown, dans une logique progressive, dans la langue des cours de l'apprenant. | V1 | L |
| BR-COU-02 | Chaque passage du cours tiré des apports cite ses sources (extrait, page/minute/ancre) ; un passage issu des connaissances du tuteur est signalé « Complété par le tuteur · à confirmer dans vos sources ». | V1 | L, M |
| BR-COU-03 | Un chapitre sans apport reçoit un cours de base rédigé par le tuteur, signalé comme tel, accompagné de suggestions de ressources. | V1 | L |
| BR-COU-04 | Chaque chapitre se termine par une fiche « À retenir » : 3 à 7 points clés, un schéma simple (blocs/flèches) quand pertinent, un moyen mnémotechnique si la notion est une liste, un ordre ou un chiffre. | V1 | L, M |
| BR-COU-05 | Un chapitre peut comporter une « question éclair » avant une section : question posée, réponse masquée derrière « Afficher la réponse ». | V1 | M |
| BR-COU-06 | Quand deux notions proches risquent d'être confondues, le cours contient un bloc « Ne pas confondre » qui les oppose. | V1 | M |
| BR-COU-07 | En fin de chapitre, l'apprenant rédige un résumé avec ses mots (3 à 4 phrases suggérées) ; le tuteur le corrige et signale ce qui manque. | V1 | L, M |
| BR-COU-08 | La progression de lecture (% par chapitre et par cours) est enregistrée et affichée. | V1 | M |
| BR-COU-09 | L'apprenant peut corriger ou compléter une section, ou signaler une erreur ; toute modification crée une nouvelle version ; un contenu signalé sort des tirages jusqu'à correction. | V1 | L |
| BR-COU-10 | Le cours est stocké par version ; les résultats et citations restent liés à la version utilisée. | V1 | L |
| BR-COU-11 | Le cours affiche : sommaire (chapitres et sections), badge « Chapitre n sur N », temps de lecture estimé (200 mots/min), « Construit à partir de N apports », liens vers les extraits (note vocale, vidéo, page PDF), navigation chapitre précédent/suivant, carte « Prêt pour le quiz de validation ? ». | V1 | M |

## TUT — Discussion avec le tuteur

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-TUT-01 | La discussion s'ouvre depuis le cours par : la carte « Demander au tuteur » (avec questions suggérées), un bouton à côté d'un passage, ou la sélection d'un texte d'au moins 12 caractères (barre « Demander au tuteur »). | V1 | L, M |
| BR-TUT-02 | Le panneau affiche le contexte transmis : formation, cours en lecture (chapitre, % lu), passage (si présent), apports, lacune suivie, profil ; chaque élément peut être retiré ou remis ; un compteur indique le nombre d'éléments inclus. Seuls les éléments inclus sont envoyés au modèle. | V1 | L, M |
| BR-TUT-03 | Les réponses citent leurs sources (apports) quand elles s'en servent et proposent des suites : « Explique autrement », « Un exemple concret », comparaison de notions proches, « Teste-moi ». | V1 | L, M |
| BR-TUT-04 | « Teste-moi » : le tuteur pose une question sur la notion ; la réponse est corrigée ; le résultat met à jour la maîtrise ; une erreur place la notion dans le prochain quiz global. | V1 | M |
| BR-TUT-05 | Face à une lacune, le tuteur pose d'abord une question avant de réexpliquer. | V1 | L |
| BR-TUT-06 | Entrée envoie, Maj+Entrée va à la ligne, Échap ferme le panneau et rend le focus au bouton d'ouverture ; « Nouvelle discussion » réinitialise l'échange. | V1 | M |
| BR-TUT-07 | L'historique d'une discussion est conservé par cours ; il est privé. | V1 | ADR-0040 |

## BRI — Briques (contenus et exercices)

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-BRI-01 | Treize types de briques : texte, extrait de ressource, question à choix, question ouverte, texte à trous, association, remise en ordre, classement, carte de rappel, consigne, dialogue scénarisé, minuteur, barème. Un nouveau type demande du code. | V1 | L |
| BR-BRI-02 | Format : chaque brique respecte le schéma de son type (champs obligatoires, bornes). Question à choix : 2 à 6 options, au moins une juste. | V1 | L |
| BR-BRI-03 | Toute brique pédagogique est rattachée à au moins une notion existante. | V1 | L |
| BR-BRI-04 | Toute brique de contenu indique son origine : ressource importée (avec extraits) ou connaissances du tuteur. | V1 | L |
| BR-BRI-05 | Toute référence (notion, ressource, extrait, brique) existe et appartient à l'utilisateur ou à son programme. | V1 | L |
| BR-BRI-06 | Une modification crée une nouvelle version ; les réponses passées restent liées à la version utilisée. | V1 | L |
| BR-BRI-07 | Chaque distracteur d'une question à choix est associé à la notion qu'il représente (pour détecter les confusions). L'empreinte d'une question est le hachage SHA-256 de son énoncé normalisé et de sa bonne réponse. | V1 | L |
| BR-BRI-08 | Question à choix, texte à trous, association, remise en ordre, classement et minuteur sont corrigés par le code ; question ouverte, consigne et dialogue sont évalués par le tuteur selon les critères fixés à la création, note bornée par le barème. | V1 | L |
| BR-BRI-09 | Une activité est un assemblage de briques valides décidé par le tuteur : cours, quiz de validation, session de quiz global, remédiation, exercice pratique, examen blanc (V1) ; mise en situation, projet fil rouge (V2). | V1 | L |

## QUI — Quiz de validation

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-QUI-01 | Chaque module a un quiz de validation : questions à choix et questions ouvertes, 12 questions par défaut (10 à 20 selon le nombre de notions), barème sur 100, seuil du module. | V1 | L, M, ADR-0014 |
| BR-QUI-02 | Tentatives illimitées ; chaque tentative est conservée : réponses, justesse, temps par question, score global et par notion. | V1 | L |
| BR-QUI-03 | Chaque tentative tire de **nouvelles** questions de la banque de la notion (aucune question déjà vue, par empreinte), couvre chaque notion du module au moins une fois et surpondère les notions en lacune ; une génération n'a lieu que si la banque est épuisée. | V1 | L |
| BR-QUI-04 | Retour immédiat : après chaque réponse, « Vérifier » affiche la justesse et l'explication ; la réponse n'est plus modifiable. Les questions ouvertes reçoivent leur correction du tuteur à la soumission de la tentative. | V1 | L, M |
| BR-QUI-05 | Score ≥ seuil : module validé, module suivant débloqué, notions du module ajoutées au quiz global, jalon « module validé », notification. | V1 | L |
| BR-QUI-06 | Score < seuil : lacunes qualifiées, remédiation proposée, nouvelle tentative possible après le délai de l'automatisme 4 (24 h par défaut). | V1 | L |
| BR-QUI-07 | L'écran de quiz affiche : numéro de tentative, seuil, progression (question n sur N), type de question, notion, « Correction immédiate · nouvelles questions à chaque tentative ». | V1 | M |
| BR-QUI-08 | L'écran de résultat affiche : score, seuil, réussite/échec, score par notion, lacunes détectées (avec nature), historique des tentatives (graphique), actions : remédiation ciblée, nouvelle tentative (date de disponibilité), ouvrir le module suivant si validé. | V1 | M |

## LAC — Lacunes et maîtrise

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-LAC-01 | Maîtrise d'une notion (0 à 100 %) = moyenne pondérée des réussites de toutes ses réponses, poids = 0,5^(âge en jours / 14). Seuil de maîtrise : 80 %. | V1 | L, ADR-0024 |
| BR-LAC-02 | Une notion devient une lacune si sa maîtrise reste sous le seuil après une tentative de quiz de validation, d'examen ou d'exercice, ou si la même erreur (même distracteur ou même réponse fausse normalisée) revient lors de deux tentatives. | V1 | L |
| BR-LAC-03 | Nature d'une lacune : **oubli** (notion réussie au moins une fois puis échouée ≥ 7 jours après, ou signalée par FSRS) ; **confusion** (le distracteur choisi représente une autre notion, ou erreur d'association/classement entre deux notions) ; **incompréhension** (≥ 2 échecs sur la notion dont au moins une réponse ouverte jugée hors sujet) ; **difficulté d'application** (questions de définition réussies mais exercice échoué). En cas de cumul, priorité : confusion > difficulté d'application > incompréhension > oubli. | V1 | L, ADR-0024 |
| BR-LAC-04 | Réponse du tuteur selon la nature : oubli → révision dans le quiz global ; confusion → question qui oppose les deux notions et comparaison côte à côte ; incompréhension → nouvelle explication sous un autre angle ; difficulté d'application → exercice pratique. | V1 | L |
| BR-LAC-05 | Page « Mes lacunes » par formation : statistiques (notions à consolider, notions maîtrisées, prochaine révision), filtres par nature avec compteurs, une carte par lacune (nature, module et chapitre, notion, ce qui l'a révélée, ce que le tuteur propose, maîtrise et seuil, actions « S'entraîner » et « Revoir dans le cours »). | V1 | L, M |
| BR-LAC-06 | Une lacune est levée quand la notion est réussie au moins 2 fois à au moins 1 jour d'intervalle et que sa maîtrise atteint le seuil. | V1 | M, ADR-0024 |

## MEM — Mémorisation et quiz global

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-MEM-01 | Répétition espacée par **notion** avec FSRS (bibliothèque `ts-fsrs`) ; taux de mémorisation visé 90 % par défaut (réglable 85/90/95 %, automatisme 7). | V1 | L, ADR-0025 |
| BR-MEM-02 | La note FSRS est déduite de la justesse et du temps de réponse (aucune confiance demandée) : faux → Again ; juste et temps > 2× le temps médian de l'apprenant pour ce format → Hard ; juste → Good ; juste et temps < 0,5× la médiane → Easy. La carte de rappel garde l'auto-évaluation (Raté/Difficile/Bon/Facile → Again/Hard/Good/Easy), avec l'échéance affichée sous chaque bouton. | V1 | L, M, ADR-0025 |
| BR-MEM-03 | Quiz global propre à chaque formation : chaque jour, les notions dues (FSRS) de tous les modules validés et du module en cours déjà évalué, lacunes en tête, modules entrelacés, durée plafonnée (automatisme 7). Chaque module validé y ajoute ses notions. | V1 | L |
| BR-MEM-04 | Une même notion ne revient pas deux fois de suite sous le même format ; le tuteur varie question, texte à trous, association, etc. | V1 | L |
| BR-MEM-05 | Jeux de mémorisation V1 : carte de rappel, texte à trous (sans liste de choix, comparaison insensible à la casse et aux accents, variantes acceptées), association, remise en ordre, classement. Ils sont corrigés par le code. Une erreur d'association ou de classement entre deux notions est enregistrée comme confusion. | V1 | L, M |
| BR-MEM-06 | Indicateur de rétention : part des notions réussies parmi celles revues 30 jours (± 3) et 60 jours (± 3) après la validation de leur module ; affiché à 1 mois et 2 mois. | V1 | L |
| BR-MEM-07 | Banques de questions : plusieurs variantes par notion et par format (au moins 4 variantes par notion), générées en lot la nuit précédant le besoin ; régénérées quand l'apprenant a vu toutes les variantes. Les banques sont **propres à chaque apprenant** (issues de son cours privé). | V1 | L, ADR-0026 |
| BR-MEM-08 | Session de quiz global : rail des jeux (statut fait/en cours/à venir), barre de progression, raison du choix du tuteur affichée, bouton « Passer », écran de fin (notions revues, réussies espacées davantage, à revoir plus tôt, série). | V1 | M |
| BR-MEM-09 | Une brique signalée erronée sort du quiz global jusqu'à sa correction. | V1 | L |
| BR-MEM-10 | Retour immédiat : après chaque réponse d'un jeu ou d'une question, la correction et l'explication sont affichées. | V1 | L |
| BR-MEM-11 | « Explique à un débutant » : l'apprenant explique une notion au tuteur, qui joue un novice et évalue l'explication. | V2 | L |

## PRA — Pratique : exercices, examens blancs, mises en situation, projet

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-PRA-01 | Exercice pratique (brique consigne) : consigne, données, production attendue de type texte, fichier, lien ou **tableau structuré** (colonnes typées définies par le tuteur, contrôles automatiques facultatifs comme « somme débit = somme crédit »), barème sur 10 réparti par critères, 2 indices maximum (chacun retire 1 point), correction du tuteur par critère avec explication, mise à jour de la maîtrise, prochaine étape proposée. | V1 | L, M, ADR-0027 |
| BR-PRA-02 | Examen blanc : reproduit le format officiel (nombre de questions, durée, seuil) quand il est connu, extrait d'un apport (guide de certification) et confirmé par l'apprenant ; sinon : 20 questions, 2 minutes par question, seuil 70 %, chronométré, sans aide, corrigé à la fin. | V1 | L, M, ADR-0028 |
| BR-PRA-03 | Pendant l'examen : menu, en-tête, tuteur et cours masqués ; chronomètre visible (orange sous 5 min) ; navigation libre ; marquage « à revoir » ; confirmation avant de terminer (questions sans réponse et marquées) ; soumission automatique à la fin du temps ; la réouverture de la page reprend l'examen avec le temps restant réel. | V1 | M |
| BR-PRA-04 | Résultats d'examen : score global et seuil, score sur les modules étudiés, score diagnostic des modules non étudiés (compté à part, non pénalisant), détail par module, erreurs ajoutées aux lacunes (modules étudiés uniquement), plan du tuteur, revue des réponses filtrable (toutes / erreurs) avec explication. | V1 | M |
| BR-PRA-05 | Si un objectif « examen » existe, deux examens blancs sont planifiés : à la fin de l'avant-dernier module et le dernier jour de la formation ; un examen blanc de diagnostic peut être lancé à tout moment depuis le programme. | V1 | M, ADR-0028 |
| BR-PRA-06 | Mise en situation : dialogue scénarisé (rôle, contexte, objectif, condition de fin, critères) joué avec le tuteur, évalué par barème. | V2 | L |
| BR-PRA-07 | Projet fil rouge : suite de consignes réparties sur la formation, livrables évalués, évaluation finale. | V2 | L |

## AGE — Agenda et planification

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-AGE-01 | Agenda commun à toutes les formations de l'utilisateur, filtrable par formation ; vues Jour, Semaine (lundi-vendredi + week-end si jours d'étude), Mois ; navigation précédent/suivant bornée aux dates des formations ; bouton « Aujourd'hui » ; mini-calendrier mensuel cliquable. | V1 | L, M |
| BR-AGE-02 | Types d'activités planifiées : apports, cours, exercice, quiz de validation, quiz global, révision, marge de rattrapage, sprint, examen blanc, échauffement, micro-séance, bilan. Chaque type a une couleur et figure dans la légende. | V1 | M |
| BR-AGE-03 | Planificateur (code, glouton sous contraintes) : place les activités de chaque module dans les jours et moments d'étude, sans dépasser les heures par jour cumulées toutes formations ; réserve au moins une marge de rattrapage par module (1 h, après le quiz de validation) ; place le quiz global quotidien (fin de journée d'étude). | V1 | L, ADR-0029 |
| BR-AGE-04 | Statut d'un créneau : prévu, fait, manqué (non fait à la fin de la journée), déplacé, annulé. | V1 | L |
| BR-AGE-05 | Sélectionner une activité affiche son détail (type, titre, jour, horaire, informations, « Ouvrir », « Déplacer ») ; « Déplacer » propose les 3 prochains créneaux libres compatibles. | V1 | M |
| BR-AGE-06 | Totaux affichés pour la période : heures prévues, heures faites, marges de rattrapage restantes. | V1 | M |
| BR-AGE-07 | Une ligne indique l'heure actuelle sur le jour courant ; un jour cliqué en vue semaine ou mois ouvre la vue jour. | V1 | M |

## NOT — Notifications

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-NOT-01 | Centre de notifications (cloche) : pastille du nombre de non lues ; liste groupée « Aujourd'hui », « Hier », « Plus tôt » ; filtre Toutes / Non lues ; « Tout marquer comme lu » ; chaque notification (icône de type, titre, texte, formation, heure, point non lu) mène à l'écran concerné et se marque lue au clic ; lien « Gérer les notifications ». | V1 | L, M |
| BR-NOT-02 | Types : quiz de validation à venir, cours prêt, quiz global du jour, nouvelle lacune, séance prévue, module validé, séance à replacer, bilan de la semaine, jalon atteint, alerte de coût IA, échec de tâche IA, export prêt, invitation de groupe. | V1 | L, M |
| BR-NOT-03 | Canaux : application (toujours actif, non désactivable), e-mail, notification du navigateur (Web Push, permission demandée). | V1 | L |
| BR-NOT-04 | Réglages par défaut : e-mail et navigateur activés ; tous les types activés ; programme du jour envoyé à 08:00 ; heures calmes 21:00-08:00 ; « Rien le week-end, sauf les révisions dues » activé. | V1 | M |
| BR-NOT-05 | Plafond de notifications envoyées hors application (e-mail + navigateur) : 5 par jour par défaut (3, 5 ou 8). Au-delà, les notifications restent dans l'application et sont résumées dans le programme du jour suivant. | V1 | L, ADR-0031 |
| BR-NOT-06 | Pendant les heures calmes, aucun e-mail ni notification navigateur n'est envoyé ; ils sont reportés à la fin des heures calmes (ou supprimés s'ils sont devenus sans objet). | V1 | L |
| BR-NOT-07 | Rappel de quiz de validation 40 minutes avant l'heure planifiée. | V1 | M |
| BR-NOT-08 | Chaque e-mail contient un lien de gestion des préférences ; les e-mails transactionnels (connexion, sécurité, suppression, export) ne sont pas soumis aux réglages. | V1 | ADR-0032 |

## AUT — Automatismes

Paramètres et valeurs par défaut normatifs ; tous activés par défaut ; réglables dans Paramètres › Automatismes.

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-AUT-01 | **Reprise après décrochage** : une séance manquée est replacée dans la prochaine marge disponible ; après N jours sans activité (défaut 2 ; 1/2/3) une reprise de 5 min est proposée ; après M jours (défaut 5 ; 4/5/7) le tuteur propose d'alléger le programme ou de décaler la fin. Replacement automatique ou « après mon accord » (défaut). | V1 | L, M |
| BR-AUT-02 | **Micro-séance de secours** : si aucune activité de la journée n'est faite à l'heure H (défaut 20:00 ; 19/20/21 h), une version courte (cartes de rappel + une question) de D minutes (défaut 5 ; 3/5/10) est proposée ; la faire conserve la série. | V1 | L, M |
| BR-AUT-03 | **Échauffement** : chaque séance commence par N questions de rappel (défaut 3 ; 2/3/5) portant sur les notions vues la veille et les prérequis du chapitre (liens « prérequis » de la carte), ou la veille seulement ; « Je savais » / « À revoir » ; une notion « à revoir » passe dans le quiz global du soir. | V1 | L, M |
| BR-AUT-04 | **Remédiation après un quiz raté** : sous le seuil, une remédiation ciblée sur les lacunes (≈ 15 min : texte ciblé, extraits, nouvelles questions) est préparée ; la tentative suivante est disponible après un délai (défaut 24 h ; 0/12/24/48 h) ; remédiation conseillée (défaut) ou obligatoire avant nouvelle tentative. | V1 | L, M |
| BR-AUT-05 | **Jeu choisi selon la lacune** : confusion → association ou classement opposant les deux notions ; oubli → carte de rappel ; difficulté d'application → exercice ; préférence : varier (défaut), plutôt cartes, plutôt association et classement. La raison du choix est affichée. | V1 | L, M |
| BR-AUT-06 | **Questions transformées en cartes** : une question posée au tuteur peut devenir une carte de rappel ; mode « avec ma confirmation » (défaut) ou automatique. | V1 | L, M |
| BR-AUT-07 | **Quiz global plafonné et lissé** : durée maximale par jour (défaut 15 min ; 10/15/20/30) ; si les notions dues dépassent le plafond, les moins urgentes sont reportées aux jours suivants, lacunes en tête ; taux de mémorisation visé (défaut 90 % ; 85/90/95). | V1 | L, M |
| BR-AUT-08 | **Sprint avant un jalon** : avant chaque quiz de validation ou examen blanc, des révisions courtes (30 min) sur les notions les plus faibles du module sont planifiées à J-K et J-1 (défaut K = 3 ; 2/3/5). | V1 | L, M |
| BR-AUT-09 | **Bilan de la semaine** : chaque semaine (défaut dimanche 19:00 ; jour ven/sam/dim, heure 18/19/20 h) : heures d'étude, rétention, notions à risque d'oubli, plan de la semaine suivante, question « vos disponibilités changent-elles ? » ; canal application (défaut) ou application et e-mail. | V1 | L, M |
| BR-AUT-10 | **Mode pause et retour** : l'apprenant déclare une pause jusqu'à une date ; le planning est gelé et la série n'est pas interrompue ; au retour, si activé (défaut), un diagnostic de 10 min sur les notions à risque précède la replanification. | V1 | L, M |
| BR-AUT-11 | Garde-fous communs : heures calmes et plafond de notifications respectés ; les grands changements (alléger le programme, décaler la fin) attendent toujours l'accord de l'apprenant ; chaque action est expliquée en une ligne, journalisée et annulable (sauf action déjà consommée, ex. micro-séance faite). | V1 | L |
| BR-AUT-12 | Journal de la semaine : liste datée des actions automatiques avec explication et « Annuler » ; compteur « N actions cette semaine ». | V1 | M |
| BR-AUT-13 | Accueil : bandeau « Le tuteur propose · votre accord est demandé » pour les actions en attente (accepter, autre créneau, annuler) ; carte « Le tuteur a agi pour vous » (actions récentes avec annuler/confirmer) ; carte « Bilan de la semaine ». | V1 | M |
| BR-AUT-14 | Détection fine de la baisse d'engagement (justesse qui chute, réponses trop rapides) et pause proposée. | V2 | L |

## GAM — Série et jalons

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-GAM-01 | Une journée compte pour la série si l'utilisateur a terminé au moins une activité d'étude (session de quiz global, micro-séance, quiz, exercice, examen, lecture ≥ 5 min ou dépôt d'apport) dans son fuseau. La série = jours d'étude consécutifs ; les jours non prévus dans le rythme et les jours de pause ne cassent pas la série. | V1 | L, ADR-0033 |
| BR-GAM-02 | Le menu affiche la série (« 12 jours ») et la régularité sur les 14 derniers jours (une case par jour : faite/non faite). | V1 | M |
| BR-GAM-03 | Jalons sobres : module validé, 100 notions retenues (maîtrise ≥ 80 %), 30 jours de série. Pas de classement ; rien ne récompense la vitesse. | V1 | L |

## GRP — Formations à plusieurs

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-GRP-01 | Le propriétaire d'une formation active peut en faire une formation à plusieurs : un code d'invitation (format `LRN-XXXX`) et un lien sont générés ; 10 membres au plus (propriétaire compris). | V1 | L, M, ADR-0035 |
| BR-GRP-02 | Un invité rejoint via le lien, le code (Paramètres ou premiers pas) ; il obtient le même programme (modules, chapitres, notions, dates) et les mêmes jalons ; s'il a déjà 3 formations actives, la règle BR-FOR-10 s'applique. | V1 | L, M |
| BR-GRP-03 | Visibilité entre membres : prénom, module en cours, modules validés, série. Jamais les notes, lacunes, apports, cours ni discussions. | V1 | L |
| BR-GRP-04 | Chaque membre a ses propres apports, cours, banques, tentatives, lacunes et créneaux (planifiés dans les fenêtres communes des modules). | V1 | L, ADR-0035 |
| BR-GRP-05 | Un membre peut quitter le groupe (sa formation devient individuelle) ; le propriétaire peut retirer un membre et régénérer le code. Le programme ne peut être modifié que par le propriétaire ; les membres sont notifiés. | V1 | ADR-0035 |

## CAR — Carte des notions

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-CAR-01 | Graphe de la formation : nœud formation (centre), modules (hubs), notions (taille selon le nombre de liens), apports en option ; liens : contient, prérequis, confusion (orange pointillé), lien repéré par le tuteur (pointillé), source. | V1 | L, M |
| BR-CAR-02 | Couleurs par module ou par maîtrise (maîtrisée, à consolider, pas encore vue) ; notions à venir atténuées ; légende adaptée au mode. | V1 | M |
| BR-CAR-03 | Interactions : déplacer la vue, zoom (molette et boutons), recentrer, glisser un nœud, survol (voisinage mis en évidence, autres atténués), clic → panneau détail ; recherche de notion (Entrée sélectionne et centre) ; filtres Modules / Notions à venir / Mes apports. | V1 | M |
| BR-CAR-04 | Panneau détail : notion (module, définition, maîtrise et statut, liens groupés « S'appuie sur », « Prépare », « Se confond avec », « Lien repéré par le tuteur », « Dans vos apports », actions Revoir dans le cours / S'entraîner / Voir la lacune) ; module (notions, bilan) ; apport (notions alimentées). Sans sélection : mode d'emploi et liste « À consolider ». | V1 | M |
| BR-CAR-05 | La disposition est déterministe (même formation → même disposition) et calculée côté client sans bibliothèque externe obligatoire. | V1 | M, ADR-0036 |
| BR-CAR-06 | Détection des liens entre ressources et entre modules par le tuteur (liens « repérés » enrichis automatiquement). | V2 | L |

## PRO — Progression et accueil

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-PRO-01 | Avancement d'une formation = modules validés / modules total (en %). | V1 | M |
| BR-PRO-02 | Accueil « Votre journée » : activités du jour toutes formations (heure, pastille de type, titre, détail, statut Fait / Dans N min / À venir), heures prévues et faites ; carte rétention (anneau % à 1 mois, valeur à 2 mois) ; carte « Quiz global du jour » (notions à revoir, jeux, durée, report éventuel, « Jouer maintenant ») ; tableau des formations (titre, objectif, progression, module en cours et statut, prochaine activité, fin prévue, action). | V1 | M |
| BR-PRO-03 | Onglet « Terminées » : résultat final, mémorisation (rétention), révisions dues (ou « Entretien arrêté »), date de fin et durée, action « Réviser ». | V1 | M |
| BR-PRO-04 | Carte formation en cours dans le menu : sigle, titre, barre de progression, « Module n sur N ». | V1 | M |

## NAV — Navigation, coquille, recherche

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-NAV-01 | En-tête figé sur tous les écrans connectés : recherche globale, cloche de notifications, menu « Mon compte » (prénom, nombre de formations en cours, Paramètres, Mettre en pause, Se déconnecter). | V1 | L, M |
| BR-NAV-02 | Menu latéral en deux zones : navigation générale (Accueil, Agenda) ; section « Formation en cours » (carte formation, changer de formation, Programme, Carte des notions, Quiz global avec nombre de notions dues, Mes lacunes avec nombre de lacunes) ; série en bas. | V1 | L, M |
| BR-NAV-03 | Le menu latéral peut être masqué complètement et réaffiché depuis l'en-tête ; le choix est mémorisé sur l'appareil. Sous 900 px de large, il est masqué par défaut et s'ouvre en surimpression. | V1 | L, M |
| BR-NAV-04 | Les modules s'ouvrent depuis le Programme ; Module, Cours, Exercice, Quiz affichent un fil d'Ariane (Programme / Module n · titre / page). | V1 | M |
| BR-NAV-05 | Recherche globale (≥ 2 caractères, insensible à la casse et aux accents) sur les notions, chapitres de cours et formations de l'utilisateur ; résultats groupés, navigation clavier, page de résultats complète. | V1 | L, M |
| BR-NAV-06 | L'interface est affichée à l'échelle 90 % des maquettes (base typographique `html { font-size: 90% }`, jetons en rem). | V1 | M, ADR-0034 |

## SET — Paramètres

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-SET-01 | Paramètres en quatre onglets (ARIA tabs) : Profil, Notifications, Automatismes, Modèles d'IA ; l'onglet actif est reflété dans l'URL (`#profil`, `#notifications`, `#automatismes`, `#modeles`) ; défaut Profil. | V1 | M |
| BR-SET-02 | Profil : identité (prénom, nom, e-mail en lecture seule), langue des cours, ton, fuseau horaire ; rythme d'apprentissage avec résumé chiffré (« 5 h par jour, 5 jours sur 7, plutôt matin et après-midi : 25 h par semaine. ») ; données et confidentialité (exporter, supprimer le compte) ; « Enregistrer » avec confirmation. | V1 | M |
| BR-SET-03 | Notifications : canaux (application verrouillé, e-mail, navigateur), types (6 interrupteurs : révisions et quiz global [recommandé], quiz de validation à venir, cours prêt, nouvelle lacune, planning réajusté, relance après une pause) avec compteur « N sur 6 activés », quand (programme du jour, heures calmes de/à, week-end). | V1 | M |
| BR-SET-04 | Automatismes : bandeau de principe et compteur ; trois groupes (Contre le décrochage : 1, 2, 9 ; Mémorisation : 3, 6, 7 ; Quiz et jeux : 4, 5, 8) ; chaque automatisme : interrupteur, règle, réglages (visibles si activé), dernière action ; carte Mode pause (10) ; garde-fous (plafond de notifications, grands changements « toujours sur accord », heures calmes) ; journal de la semaine. | V1 | M |
| BR-SET-05 | Modèles d'IA : bandeau de principe ; modèle par tâche (5 tâches, capacités exigées, sélection parmi les modèles qualifiés, pastille « Par défaut » / « Personnalisé » / « Hors UE ») ; « Revenir aux modèles par défaut » ; fournisseurs (Anthropic par défaut, clés enregistrées avec statut Qualifié / Non qualifié, tester à nouveau, supprimer la clé) ; ajouter un fournisseur (fournisseur, nom du modèle, adresse si compatible/local, clé, « Tester et qualifier », résultat de qualification, avertissement données). | V1 | L, M |
| BR-SET-06 | Abonnement : état de l'abonnement à l'IA fournie, souscription (Stripe Checkout), gestion (portail Stripe), consommation du jour par rapport au plafond. | V1 | ADR-0011 |

## PLA — Plateforme, qualité, conformité

| ID | Règle | Prio | Source |
|---|---|---|---|
| BR-PLA-01 | Application web installable (manifest, icônes, service worker). Hors ligne : la session de quiz global du jour et les cartes de rappel sont jouables ; les réponses sont mises en file et synchronisées au retour du réseau ; FSRS est recalculé côté serveur ; en cas de conflit, le serveur fait foi. | V1 | L, ADR-0037 |
| BR-PLA-02 | Responsive : utilisable de 360 px à 1920 px de large ; cibles tactiles ≥ 44 px. | V1 | L |
| BR-PLA-03 | Accessibilité WCAG 2.2 AA : navigation clavier complète, focus visible, rôles ARIA, contrastes, `prefers-reduced-motion`, aucune violation axe de niveau serious/critical. | V1 | ADR-0038 |
| BR-PLA-04 | Données (base, fichiers, fonctions) hébergées dans l'Union européenne. | V1 | L |
| BR-PLA-05 | RGPD : consentement aux CGU/confidentialité, export et suppression en libre-service, registre des traitements, liste des sous-traitants, cookies strictement nécessaires uniquement (pas de bandeau). | V1 | L, ADR-0045 |
| BR-PLA-06 | Pages légales accessibles sans connexion : CGU, politique de confidentialité, mentions légales. | V1 | ADR-0045 |
| BR-PLA-07 | Performances : LCP < 2,5 s et INP < 200 ms au 75e centile sur les pages principales ; API p95 < 300 ms hors appels IA. | V1 | ADR-0041 |
| BR-PLA-08 | Sécurité : en-têtes (CSP stricte, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), limitation de débit, isolation des données par Row Level Security, secrets uniquement côté serveur. | V1 | L, ADR-0042 |
