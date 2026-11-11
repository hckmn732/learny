# Glossaire

Termes employés dans le code (identifiant anglais entre parenthèses quand il diffère) et dans l'interface (français).

| Terme (UI) | Identifiant code | Définition |
|---|---|---|
| Apprenant | `user`, `learner` | Utilisateur inscrit qui suit des formations. |
| Formation | `formation` | Parcours d'apprentissage d'un sujet : objectifs, dates, programme. Statuts : `cadrage`, `programme_proposed`, `active`, `paused`, `completed`, `archived`. |
| Cadrage | `cadrage` | Dialogue initial (≤ 5 questions) qui définit périmètre, point de départ, niveau visé, volume, dates. |
| Programme | `programme` | Ensemble ordonné des modules et chapitres d'une formation. |
| Module | `module` | Thématique du programme ; statut `locked`, `open`, `validated` ; possède un seuil de validation. |
| Chapitre | `chapter` | Partie d'un module ; reçoit les apports ; statut d'apports `in_progress` / `done`. |
| Notion | `notion` | Unité de connaissance à maîtriser, rattachée à un chapitre ; pivot des questions, révisions, lacunes et sources. |
| Lien entre notions | `notion_link` | `prerequisite` (A prépare B), `confusion` (A se confond avec B), `tutor` (lien repéré par le tuteur). |
| Apport / ressource | `resource` | Contenu déposé par l'apprenant (note, PDF, page web, YouTube, image) ou suggéré par le tuteur. |
| Passage / extrait | `resource_chunk` | Morceau d'un apport avec son emplacement (page, minute, ancre), indexé pour la recherche sémantique et cité. |
| Cours | `course` | Contenu rédigé par le tuteur pour un module, versionné, organisé en sections par chapitre. |
| Section | `course_section` | Bloc d'un cours : texte, question éclair, « Ne pas confondre », « Complété par le tuteur », « À retenir », invitation au résumé. |
| Citation | `citation` | Lien entre une section et un passage d'apport. |
| Brique | `brick` | Élément élémentaire codé (13 types) au format fixe, versionné (`brick_version`). |
| Activité | `activity` | Assemblage de briques : cours, quiz de validation, session de quiz global, remédiation, exercice, examen blanc, échauffement, micro-séance, sprint. |
| Tentative | `attempt` | Passage d'une activité évaluée par l'apprenant ; contient des réponses (`answer`). |
| Banque de questions | `question bank` | Briques de révision préparées à l'avance par notion et par format (statut `bank`). |
| Empreinte | `fingerprint` | SHA-256 de l'énoncé normalisé + bonne réponse ; empêche de reposer une question déjà vue. |
| Maîtrise | `mastery` | Score 0-100 % d'une notion, pondéré par la récence (demi-vie 14 jours). |
| Lacune | `gap` | Notion sous le seuil de maîtrise ou erreur répétée ; nature `forgetting`, `confusion`, `misunderstanding`, `application`. |
| Remédiation | `remediation` | Activité ciblée sur les lacunes après un quiz raté. |
| Répétition espacée | `fsrs` | Algorithme FSRS qui calcule la prochaine date de révision d'une notion. |
| Quiz global | `global quiz` | Session quotidienne de révision des notions dues de toute la formation. |
| Jeu de mémorisation | `game` | Carte de rappel, texte à trous, association, remise en ordre, classement (et « Explique à un débutant » en V2). |
| Échauffement | `warmup` | Questions de rappel au début d'une séance (automatisme 3). |
| Micro-séance | `micro session` | Version courte (5 min) de la séance du jour (automatisme 2). |
| Sprint | `sprint` | Révisions courtes avant un jalon (automatisme 8). |
| Marge de rattrapage | `buffer` | Créneau réservé par le planificateur pour absorber un retard ou un échec. |
| Créneau | `schedule_slot` | Activité placée dans l'agenda ; statut `planned`, `done`, `missed`, `moved`, `cancelled`. |
| Automatisme | `automation` | Action automatique du tuteur entre les séances (10 en V1) ; journalisée, annulable. |
| Action automatique | `automation_action` | Entrée du journal : proposition en attente d'accord, appliquée, annulée, refusée. |
| Pause | `pause` | Période déclarée où le planning est gelé sans casser la série. |
| Série | `streak` | Jours d'étude consécutifs. |
| Jalon | `milestone` | Événement sobre : module validé, 100 notions retenues, 30 jours de série. |
| Rétention | `retention` | Part des notions réussies parmi celles revues 30/60 jours après leur module. |
| Tuteur | `tutor` | Agent IA qui propose des actions validées par le code. |
| Action du tuteur | `tutor tool` | Outil du registre fermé (lire les ressources, créer/modifier, planifier…). |
| Tâche IA | `ai task` | Catégorie d'appel IA : `programme`, `course`, `gaps`, `tutor`, `light`. |
| IA fournie | `managed AI` | Modèles Claude fournis par Learny, sur abonnement. |
| Clé personnelle | `BYOK credential` | Clé d'API d'un fournisseur apportée par l'utilisateur, chiffrée. |
| Qualification | `qualification` | Batterie de tests qui autorise l'usage d'un modèle personnel. |
| Plafond IA | `daily AI cap` | Dépense quotidienne maximale de l'IA fournie par apprenant. |
| Formation à plusieurs | `group` | Formation partagée par 2 à 10 membres (programme et jalons communs). |
| Examen blanc | `mock exam` | Épreuve chronométrée, sans aide, au format de l'examen visé. |
| Exercice pratique | `practice exercise` | Consigne corrigée par le tuteur selon un barème. |
| Bilan final | `final review` | Synthèse présentée à la fin d'une formation. |
| Spécification | `SPEC-xxx` | Unité de travail du référentiel (`specs/`). |
| Point de contrôle | `CP-n` | Validation de fin de phase (`specs/checkpoints.md`). |
| Preuve | `evidence` | Rapports, vidéo, captures d'une spécification (`evidence/SPEC-xxx/`). |
