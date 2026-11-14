# SPEC-704 — critères d'acceptation

Preuves des exécutions du 2026-11-14 sur la pile Supabase locale et la base réelle (`pnpm db:reset`
+ jeu de démonstration SPEC-115), horloge figée au 2026-11-11T12:20:00Z (ADR-0047), IA non
sollicitée (`LLM_MODE=mock`). Les rapports `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`,
`checks.json` et les captures/vidéos sont copiés dans ce dossier par
`node tools/sdd/validate.mjs SPEC-704`.

- ✅ **CA-1** — À l'horloge de référence, `/agenda` affiche la vue Semaine du 9 au 13 nov. 2026, le
  libellé `9 – 13 nov. 2026`, le sur-titre exact et la sélection par défaut « Quiz de validation »
  14:00 – 15:00.
  Preuve : e2e `@SPEC-704 › vues, navigation et détail` vérifie `agenda-header`
  ("Toutes vos formations · semaine du 9 – 13 nov."), `agenda-range` ("9 – 13 nov. 2026"), les cinq
  en-têtes `agenda-day-header-2026-11-0x`, `aria-pressed="true"` sur le bouton quiz et
  `agenda-detail-title`/`agenda-detail-when` ("Mercredi 11 nov. · 14:00 – 15:00") ; unitaires
  `[SPEC-704] agenda : calculs › rangeLabel …` et intégration `[SPEC-704] getAgenda › renvoie les
  créneaux de la semaine …` fixent la même période. Preuve : `e2e.json`, `video/`, `screenshots/`.
- ✅ **CA-2** — La ligne de l'heure est sur la colonne du mercredi 11, à la position de 13:20, et
  absente des autres colonnes.
  Preuve : e2e `@SPEC-704 › vues, navigation et détail` mesure un unique `agenda-now-line`, dans
  `agenda-today-column`, avec `top: 260px` et `background-color: rgb(249, 115, 22)` ; unitaire
  `[SPEC-704] agenda : calculs › gridHours › couvre 09:00–18:00 par défaut` (9 h × 60 px + 260 px de
  13:20). Preuve : `e2e.json`, `unit.json`.
- ✅ **CA-3** — « Semaine précédente » est désactivé sur la semaine du 2 novembre et « Semaine
  suivante » sur celle du 7 décembre ; en vue Jour, « Jour suivant » depuis le vendredi 13 mène au
  lundi 16.
  Preuve : e2e `@SPEC-704 › vues, navigation et détail` filtre sur SAP S/4HANA Finance (période
  2 nov. – 11 déc.), recule à `2 – 6 nov. 2026` (bouton `agenda-prev` `disabled`), avance jusqu'à
  `7 – 11 déc. 2026` (bouton `agenda-next` `disabled`), puis en vue Jour passée au
  `2026-11-13`, `agenda-next` mène à `date=2026-11-16` et `Lundi 16 nov. 2026`. Unitaires
  `[SPEC-704] agenda : calculs › navTargets` couvrent bornes, saut de week-end et filtre « Toutes ».
  Preuve : `e2e.json`, `unit.json`, `video/`.
- ✅ **CA-4** — Cliquer l'en-tête « Lun 9 » ouvre la vue Jour du 9 nov. avec le titre
  `Lundi 9 nov. · module 3` ; cliquer une case du mois ouvre la vue Jour correspondante ; l'URL
  reflète vue, date et filtre.
  Preuve : e2e `@SPEC-704 › vues, navigation et détail` clique `agenda-day-header-2026-11-09`,
  contrôle `vue=jour`, `date=2026-11-09`, `agenda-day-title` = "Lundi 9 nov. · module 3" puis, en
  vue Mois, clique `agenda-month-cell-2026-11-16` et contrôle `vue=jour&date=2026-11-16` ;
  unitaires `resolveAgendaState` (valeurs invalides, filtre et créneau conservés). Preuve :
  `e2e.json`, `unit.json`.
- ✅ **CA-5** — Le filtre « Gestion de projet agile » ne montre que ses créneaux, met à jour le
  sur-titre et les totaux.
  Preuve : e2e `@SPEC-704 › filtre par formation` sélectionne la formation agile et vérifie
  `formation=<id>`, le sur-titre "Gestion de projet agile · semaine du 9 – 13 nov.", deux boutons
  « Agile · apports » et zéro quiz de validation, `1 h prévue` / `0 h 30 faites` /
  `0 marge de rattrapage`, la légende du mini-calendrier "26 oct. – 27 nov." et la sélection par
  défaut du jeudi 12 à 17:30 ; intégration `[SPEC-704] getAgenda › réduit bornes, créneaux et
  totaux au filtre par formation (CA-5)`. Preuve : `e2e.json`, `integration.json`,
  `screenshots/`.
- ✅ **CA-6** — Les totaux affichés égalent ceux calculés par la règle d'EF-11 sur les créneaux de
  la période (contrôle croisé API ↔ interface).
  Preuve : intégration `[SPEC-704] getAgenda` fixe `{ plannedMinutes: 1440, doneMinutes: 900,
  marginsRemaining: 3 }` pour la semaine du 9 au 13 ; e2e `@SPEC-704 › vues, navigation et détail`
  affiche "24 h prévues", "15 h faites", "3 marges de rattrapage" ; unitaires `formatDuration et
  totaux` couvrent `0 h`, `5 h`, `1 h 30` et les marges. Preuve : `integration.json`, `e2e.json`,
  `unit.json`.
- ✅ **CA-7** — « Ouvrir » mène à la cible d'ET-5 pour chaque type présent dans le seed.
  Preuve : intégration `[SPEC-704] getAgenda › cible « Ouvrir » selon ET-5 …` vérifie module, cours,
  exercice (avec `activityId`), quiz de validation, révision, quiz global, marge et les cibles
  `agendaSlotHref` d'examen blanc, micro-séance, échauffement et bilan ; e2e
  `@SPEC-704 › ouvrir une activité` clique `agenda-detail-open` et atteint
  `/formations/<sap>/modules/<m3>/quiz`. Preuve : `integration.json`, `e2e.json`, `video/`.
- ✅ **CA-8** — Un créneau `missed` est affiché avec la mention « Manquée » ; un créneau `moved` ou
  `cancelled` n'est pas affiché.
  Preuve : intégration `[SPEC-704] getAgenda › masque les créneaux déplacés et annulés (CA-8)`
  (statuts `moved`/`cancelled` absents, `missed` présent) et unitaire `SlotBlock › affiche un
  créneau fait à 0,72 d'opacité et un manqué en pointillé orange avec la mention (BR-AGE-04)`.
  Preuve : `integration.json`, `unit.json`.
- ✅ **CA-9** — `GET /agenda` refuse une plage de plus de 42 jours (400) et un filtre sur la
  formation d'un autre utilisateur (404).
  Preuve : intégration `[SPEC-704] getAgenda › refuse la formation d'un autre apprenant et l'appel
  sans session (CA-9)` (`NOT_FOUND` pour une formation étrangère et `UNAUTHENTICATED` sans session)
  et `[SPEC-704] agenda : contrats › refuse une fenêtre inversée ou de plus de 42 jours` ; e2e
  `@SPEC-704 › latence de GET /agenda` appelle la route réelle sur 42 jours (200). Preuve :
  `integration.json`, `unit.json`, `e2e.json`.
- ✅ **CA-10** — Conformité visuelle (jetons, structure, écart ≤ 12 % en vue Semaine) et aucune
  violation axe serious/critical dans les trois vues.
  Preuve : e2e `@SPEC-704 @visual › conformité SCR-12` vérifie les jetons (`agenda-detail` #111113,
  rayon 21,6 px à l'échelle 90 %, bouton Ouvrir #C6F432, carte calendrier #FFFFFF), compare les
  captures 1600×1133 aux références `SCR-12-base-desktop.png`, `SCR-12-jour-desktop.png` et
  `SCR-12-mois-desktop.png` (écarts mesurés 11,30 %, 10,18 %, 10,29 % ≤ 12 %), fige les baselines
  `agenda-semaine-desktop-linux.png`, `agenda-jour-desktop-linux.png`,
  `agenda-mois-desktop-linux.png` et lance `axeCheck` sur les trois vues (0 violation
  serious/critical). Preuve : `visual/` (side-by-side et diffs), `screenshots/`, `e2e.json`.

## Mesures et décisions

- **Performance (ET-10)** : p95 de `GET /api/v1/agenda?from=2026-11-01&to=2026-12-12&formation=all`
  mesuré à **34,3 ms** sur 20 appels réels (attendu < 300 ms), mesure attachée au test e2e
  `latence de GET /agenda`.
- **Accessibilité** : ADR-0318 — le nom accessible des créneaux commence par le texte visible
  (titre, horaire, méta) puis ajoute le type, le jour et le statut (WCAG 2.2 SC 2.5.3) ; la case du
  mois est un bouton vide superposé au numéro et aux pastilles ; l'en-tête de semaine affiche le nom
  complet du jour.

## Validation observée

- `lint`, `typecheck`, `build` : réussis sur tout le dépôt.
- Unitaires : 44 tests `[SPEC-704]` réussis, 0 échec (`unit.json`).
- Intégration : 9 tests `[SPEC-704]` réussis, 0 échec (`integration.json`).
- Navigateur : 5 tests `@SPEC-704` réussis, 0 échec, vidéos du parcours (`e2e.json`, `e2e.xml`).
- Visuel : 1 test `@SPEC-704 @visual` réussi (`checks.json`), axe sans violation bloquante.
