# Inventaire des données de démonstration (SPEC-115)

Normatif pour la seed : chaque valeur critique est reliée à un écran `SCR-xx` et à son fichier de
maquette. Les maquettes sont lues, jamais modifiées. Les valeurs absentes d'une maquette sont des
fixtures minimales de fonctionnement, signalées `fixture` et non comme référence visuelle.

Instant de référence : `2026-11-11T12:20:00Z`, soit **mercredi 11 novembre 2026, 13:20 à Paris**
(ADR-0047). Le jeu est chargé par `pnpm db:seed:demo`, en local/test uniquement, et refuse
`APP_ENV=production|preview` ainsi que tout hôte non local avant connexion.

## 1. Personne et préférences

| Écran | Fichier | Élément observé | Tables | Valeurs reprises |
|---|---|---|---|---|
| SCR-03 | `Main.dc.html` | en-tête, menu « Mon compte » | `auth.users`, `profiles` | Alex Perrin, avatar `AP`, apprenant, `Europe/Paris` |
| SCR-03 | `Main.dc.html` | carte « Série » | `profiles`, `daily_activity` | 12 jours, régularité sur 14 jours |
| SCR-15 | `Parametres.dc.html` | Identité, fuseau, rythme | `profiles`, `study_preferences` | Europe/Paris (UTC+1), 5 h/jour, jours ouvrés |
| SCR-15 | `Parametres.dc.html` | Notifications | `notification_settings` | rappels 08:00, heures calmes 21:00–08:00, 5/jour |
| SCR-15 | `Parametres.dc.html` | Automatismes, journal | `automation_settings`, `automation_actions` | reprise, échauffement, remédiation, plafond, sprint, bilan |

Camille et Hugo sont deux membres du groupe « Gestion de projet agile ». Leurs lignes personnelles
(apports, cours, tentatives, lacunes, agenda, conversations) sont distinctes et privées (BR-GRP-03,
BR-APP-03) ; seul le programme est partagé.

## 2. Formations

| Écran | Fichier | Élément observé | Tables | Valeurs reprises |
|---|---|---|---|---|
| SCR-03 | `Main.dc.html` | « Mes formations » | `formations`, `modules`, `module_progress` | SAP 38 %, module 3/7 ; Agile 83 %, module 5/6 ; Python 0 %, 8 modules proposés ; Excel validée 88 % ; Anglais validée 82 % |
| SCR-03 | `Main.dc.html` | onglets | `formations` | 3 en cours ou proposées, 2 terminées, fin prévue 11 déc. 2026 / 27 nov. 2026 / 19 févr. 2027 / 18 sept. 2026 / 2 juil. 2026 |
| SCR-05 | `Programme.dc.html` | planning et modules | `formations`, `modules`, `chapters`, `notions` | 7 modules, 24 chapitres, 48 notions, 150 h, 6 semaines (2 nov.–11 déc. 2026), seuil 80 % |
| SCR-05 | `Programme.dc.html` | statuts des modules | `modules`, `module_progress` | modules 1 et 2 validés (86 %, 91 %), module 3 ouvert, 4 à 7 verrouillés |
| SCR-03 | `Main.dc.html` | « À risque d'oubli » | `notion_states` | 14 notions à revoir, 4 lacunes, 18 notions dues, 4 reportées |
| SCR-13 | `Lacunes.dc.html` | quatre lacunes | `notion_states`, `gap_events` | variante d'exercice (oubli), clé de comptabilisation (confusion), équilibre d'une pièce (application), ledgers parallèles (incompréhension) |
| SCR-14 | `Carte.dc.html` | graphe | `notions`, `notion_links`, `notion_states` | 48 notions, maîtrises et liens `p`/`c`/`t` de la carte |
| SCR-06/07 | `Module.dc.html`, `Cours.dc.html` | apports et cours | `resources`, `courses`, `course_sections`, `citations` | 8 sources (Guide FI, note vocale, tutoriel, notes, fiche Fiori, cours, PDF), 4 apports du chapitre 2 |
| SCR-08/09/10/11 | `Exercice.dc.html`, `Quiz.dc.html`, `QuizGlobal.dc.html`, `ExamenBlanc.dc.html` | activités | `bricks`, `brick_versions`, `activities`, `attempts`, `answers` | tentative 1 du module 3 à 58 %, modules 1 et 2 validés, quiz global 14 notions, examen blanc |
| SCR-06 | `Module.dc.html` | apports du groupe | `resources`, `courses` | Camille et Hugo déposent leurs propres apports et génèrent leurs propres cours |

## 3. Agenda, notifications et automatismes

| Écran | Fichier | Élément observé | Tables | Valeurs reprises |
|---|---|---|---|---|
| SCR-12 | `Agenda.dc.html` | semaine du 9 au 13 novembre | `schedule_slots` | 21 créneaux, heures locales Paris, statuts `done`/`planned`, marges, quiz, apports, agile |
| SCR-12 | `Agenda.dc.html` | aujourd'hui 13:20 | `schedule_slots` | 09:00 relecture faite, 13:50 échauffement, 14:00 quiz tentative 2, 17:00 quiz global |
| SCR-03 | `Main.dc.html` | cloche | `notifications` | 8 notifications (3 non lues) avec titres, corps, heures et formations |
| SCR-03/15 | `Main.dc.html`, `Parametres.dc.html` | « Le tuteur a agi pour vous », journal | `automation_actions` | reprise de « Ledgers parallèles », échauffement, marge, 18→14 notions, sprint, bilan |

## 4. Matrice de correspondance

| Source | Tables vérifiées | Preuve |
|---|---|---|
| `Main.dc.html` | profils, formations, agenda, notifications, automatismes, lacunes | test unitaire `[SPEC-115] demo fixtures` (lecture du fichier) et intégration |
| `Programme.dc.html` | formations, modules, chapitres, notions, progression | test unitaire (7 modules, 24 chapitres, titres exacts) |
| `Carte.dc.html` | notions, liens, maîtrises, lacunes | test unitaire (48 notions, 4 lacunes, liens) |
| `Agenda.dc.html` | créneaux, statuts, marges | test unitaire (21 créneaux, 5 jours) et intégration |
| `Parametres.dc.html` | préférences, notifications, automatismes | test unitaire (fuseau, heures calmes, journal) |
| `Quiz.dc.html`, `QuizGlobal.dc.html`, `Exercice.dc.html`, `ExamenBlanc.dc.html` | activités, briques, tentatives | test d'intégration (lignes cohérentes) |

Une modification de maquette sans mise à jour de `demo-fixtures.ts` fait échouer le test de
correspondance (CL-4) ; la référence n'est jamais réécrite depuis la seed.
