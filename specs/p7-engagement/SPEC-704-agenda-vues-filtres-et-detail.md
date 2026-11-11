---
id: SPEC-704
title: "Agenda : vues, filtres et détail"
phase: P7
priority: V1
depends_on: [SPEC-407, SPEC-304, SPEC-411]
business_rules: [BR-AGE-01, BR-AGE-02, BR-AGE-04, BR-AGE-06, BR-AGE-07]
screens: [SCR-12]
adrs: [ADR-0183]
visual: mockup
---

# SPEC-704 — Agenda : vues, filtres et détail

## 1. Objectif

Livrer l'écran **Agenda** (`/agenda`) conforme à `design/maquettes/Agenda.dc.html` : vues Jour, Semaine et Mois sur un agenda commun à toutes les formations, filtre par formation, navigation bornée aux dates des formations, bouton « Aujourd'hui », mini-calendrier mensuel cliquable, panneau « Activité sélectionnée » (lien « Ouvrir » vers l'écran cible), légende, totaux de la période, ligne de l'heure actuelle, clic sur un jour → vue jour ; et l'API de lecture `GET /api/v1/agenda`. Le déplacement et le réajustement (bouton « Déplacer ») sont livrés par SPEC-705.

## 2. Contexte

Le planificateur (SPEC-407, ADR-0029) produit les créneaux `schedule_slots` persistés par SPEC-411 ; l'agenda les affiche dans le fuseau de l'utilisateur (BR-ACC-07, ADR-0030). L'écran est en lecture seule dans cette spécification. Lire : `design/maquettes/Agenda.dc.html` (balisage et script complet : `types`, `week2`, `MODS`, `mapEvent`, `days`, `dayCol`, `monthCells`, `monthGrid`, `views`), `docs/product/screens.md` (SCR-12, route et paramètres), `docs/architecture/data-model.md` §7, `docs/architecture/api.md` (ligne Agenda), ADR-0029, ADR-0030, ADR-0046, ADR-0183.

## 3. Dépendances

- **SPEC-407** : constantes de types d'activité et durées (`packages/config/src/product.ts`), fonctions pures utilisées pour les bornes (`formationWindow(formation)`).
- **SPEC-411** : `services.planning.listSlots(ctx, { from, to, formationId? })` (lecture RLS des `schedule_slots`) et statut `missed` posé par le cron nocturne.
- **SPEC-304** (coquille, menu « Agenda » actif) et via elle SPEC-305/306 (en-tête, notifications).
- **SPEC-207** : `packages/core/src/time.ts` (`toUserZone`, `startOfUserDay`, `userLocalHour`, `localDateOf`).
- **SPEC-115** : agenda de démonstration du 2 novembre au 11 décembre 2026 (semaine du 9 au 13 novembre détaillée comme `week2` de la maquette, autres jours générés comme la boucle `MODS`).
- Externes : aucune.

## 4. Règles métier couvertes

- **BR-AGE-01** — Un seul agenda toutes formations (filtre `formation=all` par défaut, sélecteur « Formation affichée »), vues Jour/Semaine/Mois (semaine lundi-vendredi, plus samedi/dimanche si ce sont des jours d'étude ou s'ils portent un créneau), navigation précédent/suivant désactivée hors des dates des formations, « Aujourd'hui », mini-calendrier mensuel cliquable.
- **BR-AGE-02** — Chaque type de créneau (`slot_kind`) a une couleur et un libellé (table d'ET-3) ; la légende affiche les six entrées de la maquette et, si la période en contient, les types complémentaires.
- **BR-AGE-04** — Les statuts `planned`, `done`, `missed` sont affichés (fait = opacité 0,72 ; manqué = bordure pointillée orange et mention « Manquée ») ; `moved` et `cancelled` ne sont pas affichés (le créneau de remplacement l'est).
- **BR-AGE-06** — Totaux de la période affichée : heures prévues, heures faites, marges de rattrapage restantes.
- **BR-AGE-07** — Ligne orange de l'heure actuelle sur le jour courant (vues Jour et Semaine) ; un clic sur un jour (en-tête de colonne en vue Semaine, case en vue Mois) ouvre la vue Jour.

## 5. Exigences fonctionnelles

- **EF-1 — Route et état d'URL.** `/agenda?vue=jour|semaine|mois&date=YYYY-MM-DD&formation=all|<fid>&creneau=<slotId>` ; défauts `vue=semaine`, `date` = aujourd'hui (fuseau utilisateur), `formation=all`, `creneau` = sélection par défaut (EF-8). Toute interaction met à jour l'URL par `router.replace` (pas d'entrée d'historique) ; une valeur invalide est remplacée par le défaut.
- **EF-2 — En-tête de page.** Sur-titre `{Toutes vos formations | titre de la formation filtrée} · {complément}` avec complément `semaine du 9 – 13 nov.` (vue Semaine : libellé de plage sans l'année), `Mercredi 11 nov.` (vue Jour), `novembre 2026` (vue Mois) ; titre `Agenda` (Space Grotesk 34 px).
- **EF-3 — Barre d'outils** (dans l'ordre) : `select` étiqueté (visuellement masqué) « Formation affichée » avec `Toutes les formations` puis les formations de l'utilisateur au statut `active`, `paused` ou `completed` (titre) ; groupe « Affichage » de trois boutons `Jour`, `Semaine`, `Mois` (`aria-pressed`) ; navigation : bouton précédent (`aria-label` `Jour précédent` / `Semaine précédente` / `Mois précédent`), libellé de plage `aria-live="polite"` (`9 – 13 nov. 2026`, `30 nov. – 4 déc. 2026`, `Mercredi 11 nov. 2026`, `Novembre 2026`), bouton suivant (`Jour suivant` / `Semaine suivante` / `Mois suivant`) ; bouton `Aujourd'hui`.
- **EF-4 — Navigation bornée.** Bornes = [plus petite `start_date`, plus grande `end_date`] des formations visibles dans le filtre (ADR-0183). Précédent/suivant sont `disabled` (opacité 0,3) quand la cible sort des bornes. En vue Jour, précédent/suivant sautent aux jours précédents/suivants qui sont des jours d'étude ou portent un créneau. En vue Mois, la cible est le mois précédent/suivant s'il recoupe les bornes. « Aujourd'hui » ramène `date` à aujourd'hui sans changer la vue.
- **EF-5 — Mini-calendrier** (carte blanche) : titre `{Mois} {année}` du mois de `date`, sous-titre `Formation : {début} – {fin}` (période de la formation filtrée, ou de la formation en cours du menu si `formation=all`, ADR-0183) ; en-têtes `L M M J V S D` ; une case par jour (`aria-label` `Mercredi 11 nov.`, `aria-current="date"` sur `date`) ; aujourd'hui fond `#111113` texte blanc ; jours de la période affichée fond `#ECECFC` (vues Jour et Semaine) ; jours d'étude dans les bornes en `#111113` graisse 600, autres en `#62626B`. Un clic change `date` sans changer la vue.
- **EF-6 — Vue Semaine.** Grille de 5 colonnes (7 si EF-4/BR-AGE-01 l'exige) ; en-tête de colonne = bouton (`aria-label` `Afficher le Lundi 9 nov.`) avec jour abrégé (`Lun`, `Mar`, `Mer`, `Jeu`, `Ven`, `Sam`, `Dim`, majuscules visuelles) et numéro (cercle noir pour aujourd'hui) ; colonne des heures `09:00` … `17:00` ; 60 px par heure (échelle maquette) ; plage horaire selon ET-6 ; colonne du jour courant fond `#FAFAF6`. Chaque créneau est un bouton positionné (haut = début, hauteur = durée − 4 px), fond et texte selon son type, titre ; si durée ≥ 1 h, horaire `HH:MM – HH:MM` et méta ; sélectionné : `aria-pressed="true"` et anneau 2 px `#111113`. Créneaux qui se chevauchent : largeur partagée à parts égales (ET-7).
- **EF-7 — Vue Jour.** Titre `{Mercredi 11 nov.} · module {n}` (numéro du module du créneau principal de la formation en cours ce jour-là, omis sinon) suivi des totaux ; une colonne pleine largeur, créneaux en disposition en ligne (titre, horaire, méta) ; jour sans créneau : `Aucune activité prévue ce jour-là.`
- **EF-8 — Vue Mois.** En-têtes `Lun` … `Dim` ; cases (hauteur min 104 px, rayon 14 px) avec numéro, jusqu'à 3 pastilles (libellé : titre pour quiz de validation et examen blanc, sinon libellé du type ; pour un créneau d'une autre formation que la formation en cours quand `formation=all` : `{sigle} · {HH:MM}`), puis `+ {k} autre` / `+ {k} autres` ; week-end fond `#FAFAF8` et numéro `#A1A1AA` ; aujourd'hui bordure 2 px `#111113` et numéro dans un cercle noir ; `aria-label` `Mercredi 11 nov., 4 activités` / `…, aucune activité`. Un clic ouvre la vue Jour de ce jour.
- **EF-9 — Sélection et détail.** Sélection par défaut : premier créneau de la période affichée dont la fin est postérieure à maintenant, sinon le premier créneau de la période ; démonstration : `Quiz de validation` du mercredi 11 nov. 14:00. Panneau sombre (`#111113`, rayon 24 px) : titre de section `Activité sélectionnée` (12 px, majuscules, `#C6F432`), pastille du type (marge : fond `#2A2A30` texte `#D4D4D8`), titre (Space Grotesk 22 px), `{Mercredi 11 nov.} · {14:00 – 15:00}`, méta, actions `Ouvrir` (lien citron vers la cible d'ET-5) et `Déplacer` (contour ; comportement livré par SPEC-705, rendu ici sans action et `disabled` pour un créneau `done`, `missed` ou passé). Sans créneau : `Aucune activité sur cette période.` et actions masquées.
- **EF-10 — Légende** : titre `Légende` ; pastilles `Apports`, `Cours`, `Exercice`, `Quiz de validation`, `Quiz global · révision`, `Marge de rattrapage` ; plus, seulement si la période en contient : `Examen blanc`, `Sprint`, `Échauffement`, `Micro-séance`, `Bilan de la semaine` ; texte : `Si un quiz n'est pas validé, le tuteur utilise d'abord les marges. Au-delà, il vous propose de décaler la fin, d'augmenter le volume quotidien ou d'alléger le programme.`
- **EF-11 — Totaux** (en tête du calendrier) : `{5 h} prévues`, `{3 h 30} faites`, `{2} marges de rattrapage` (`1 marge de rattrapage` au singulier, `0 marge de rattrapage`). Heures prévues = somme des durées des créneaux affichés hors marges ; faites = somme des créneaux `done` hors marges ; marges = nombre de créneaux `buffer` au statut `planned`. Format de durée : `{h} h` ou `{h} h {mm}` (`0 h` si nul).
- **EF-12 — Ligne de l'heure.** Sur la colonne du jour courant, ligne 2 px `#F97316` avec pastille de 10 px à gauche, à la position de l'heure locale actuelle ; masquée hors plage horaire affichée ; mise à jour toutes les 60 s (horloge injectable côté client).
- **EF-13 — États.** Chargement : squelettes (mini-calendrier, grille) ; erreur : `ErrorState` avec `Réessayer` ; aucune formation planifiée : `EmptyState` `Votre agenda est vide` / `Validez un programme pour que le tuteur planifie vos activités.` / lien `Nouvelle formation` vers `/formations/nouvelle`.

## 6. Exigences techniques

- **ET-1 — API** `GET /api/v1/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD&formation=all|<uuid>` (route existante de l'inventaire) :
  - entrée : `from ≤ to`, écart ≤ 42 jours, sinon 400 `VALIDATION_FAILED` ;
  - sortie `AgendaDto = { timezone, today, bounds: { start, end } | null, captionPeriod: { start, end } | null, studyDays: int[], formations: { id, title, sigle, status }[], slots: AgendaSlotDto[], totals: { plannedMinutes, doneMinutes, marginsRemaining } }` ;
  - `AgendaSlotDto = { id, formationId, moduleId: uuid|null, moduleNumber: int|null, kind: SlotKind, typeLabel, title, meta, date: 'YYYY-MM-DD', startsAt, endsAt, startMinutes, endMinutes /* minutes locales depuis 00:00 */, status, href, activityId: uuid|null, movable: boolean }` ;
  - 404 si `formation` n'appartient pas à l'utilisateur ; schémas dans `packages/contracts/src/agenda.ts`.
- **ET-2 — Service** `packages/services/src/agenda/get-agenda.ts` : `getAgenda(ctx, { from, to, formation }): Result<AgendaDto>` ; lit les créneaux (statuts `planned|done|missed`), formations, `study_preferences`, `profiles.timezone`, `current_formation_id` ; calcule totaux, bornes, `href` (ET-5), `movable` (= `planned` et `starts_at > now`).
- **ET-3 — Types, libellés et couleurs** (`packages/config/src/agenda.ts`, utilisés par l'UI via les jetons) :

| `slot_kind` | Libellé | Fond | Texte | Bordure |
|---|---|---|---|---|
| `contributions` | Apports | `#E1F4EF` | `#0B5C4D` | — |
| `course` | Cours | `#ECECFC` | `#2E2E8F` | — |
| `exercise` | Exercice | `#F1FBD3` | `#3D5200` | — |
| `validation_quiz` | Quiz de validation | `#FFEDE0` | `#8F3305` | — |
| `mock_exam` | Examen blanc | `#FFEDE0` | `#8F3305` | — |
| `global_quiz` | Quiz global | `#F0E9FE` | `#5B21B6` | — |
| `revision` | Révision | `#F0E9FE` | `#5B21B6` | — |
| `sprint` | Sprint | `#F0E9FE` | `#5B21B6` | — |
| `warmup` | Échauffement | `#F0E9FE` | `#5B21B6` | — |
| `micro_session` | Micro-séance | `#F0E9FE` | `#5B21B6` | — |
| `buffer` | Marge de rattrapage | `#FFFFFF` | `#62626B` | 1 px pointillé `#A8A7A0` |
| `weekly_review` | Bilan de la semaine | `#F4F4F1` | `#3F3F46` | — |

- **ET-4 — Fonctions pures** `apps/web/lib/agenda/` : `resolveAgendaState(searchParams, today)` ; `visibleRange(view, date, studyDays, slots)` ; `navTargets(view, date, bounds, studyDays, slotDates)` ; `rangeLabel(view, range)` ; `gridHours(slots)` ; `layoutDay(slots, gridStart)` (positions et colonnes de chevauchement) ; `formatDuration(minutes)` ; `monthCells(date)` ; `chipLabel(slot, ctx)`.
- **ET-5 — Cibles « Ouvrir »** : `contributions` → `/formations/{fid}/modules/{mid}` ; `course` → `/formations/{fid}/modules/{mid}/cours` ; `exercise` → `/formations/{fid}/modules/{mid}/exercices/{activityId}` (ou le module si `activityId` nul) ; `validation_quiz` → `/formations/{fid}/modules/{mid}/quiz` ; `mock_exam` → `/formations/{fid}/examen-blanc` ; `global_quiz`, `revision`, `sprint` → `/formations/{fid}/quiz-global` ; `micro_session` → `/formations/{fid}/quiz-global?mode=micro` ; `warmup` → `/accueil#echauffement` ; `weekly_review` → `/accueil#bilan` ; `buffer` → `/agenda?vue=jour&date={date}`.
- **ET-6 — Plage horaire** : début = min(9, heure entière du plus tôt des créneaux de la période) ; fin = max(18, heure entière supérieure de la plus tardive des fins) ; libellés d'heure de début à fin − 1 (démonstration : `09:00` à `17:00`, hauteur 540 px).
- **ET-7 — Chevauchements** : regroupement des créneaux en grappes connexes ; dans une grappe, attribution gloutonne de colonnes par heure de début ; largeur = 1/nombre de colonnes.
- **ET-8 — Client** : page Server Component `apps/web/app/(app)/agenda/page.tsx` (préchargement de la période initiale) ; composant client `AgendaScreen` (TanStack Query `['agenda', from, to, formation]`, ADR-0063) ; préchargement de la période suivante au survol des boutons de navigation.
- **ET-9 — Accessibilité** : régions `section` étiquetées comme la maquette (`t-mois`, `t-detail`, `t-legende`, calendrier `aria-label="{Semaine|Jour|Mois} · {plage}"`) ; créneaux = boutons dont le nom accessible est `{titre}, {type}, {jour} {horaire}, {statut}` ; flèches gauche/droite dans la grille déplacent la sélection d'un créneau à l'autre (ordre chronologique) ; aucune information portée par la seule couleur (type dans le nom accessible).
- **ET-10 — Performance** : `GET /agenda` p95 < 300 ms pour 42 jours et 3 formations ; index `(user_id, starts_at)` existant.

## 7. Comportements attendus et cas limites

- **CL-1 — Fuseau modifié.** Les créneaux sont recalculés dans le nouveau fuseau (stockage UTC) ; un créneau peut changer de jour affiché ; la date d'URL reste une date civile.
- **CL-2 — Changement d'heure (25 oct. 2026).** Un créneau 09:00 locale reste affiché 09:00 de part et d'autre ; la ligne de l'heure suit l'heure locale.
- **CL-3 — Créneau à cheval sur minuit** (ex. 23:30–00:30) : affiché sur son jour de début, tronqué visuellement à la fin de grille, horaire complet dans le texte.
- **CL-4 — Aucun créneau dans la période.** Grille vide, totaux à `0 h`, détail « Aucune activité sur cette période. ».
- **CL-5 — Filtre sur une formation en pause.** Ses créneaux futurs sont `cancelled` (ADR-0016) donc absents ; les créneaux passés restent ; navigation bornée à sa période.
- **CL-6 — Date d'URL hors bornes.** Ramenée à la borne la plus proche ; si aucune formation : état vide.
- **CL-7 — Week-end étudié.** Si `study_days` contient 6 ou 7, la vue Semaine affiche 6 ou 7 colonnes ; une colonne de week-end n'apparaît aussi que si un créneau y figure (créé par l'apprenant ou un automatisme).
- **CL-8 — Conflit d'agenda** (deux créneaux simultanés de formations différentes, ex. déplacement manuel) : affichés côte à côte (ET-7), sans erreur.
- **CL-9 — Créneau manqué** (`missed`, posé par le cron nocturne) : affiché avec bordure pointillée `#F97316` et mention `Manquée` ; « Déplacer » désactivé ici (le replacement est l'objet de SPEC-712).
- **CL-10 — Paramètre `creneau` d'un créneau absent** de la période : ignoré, sélection par défaut.
- **CL-11 — Formation à plusieurs.** Seuls les créneaux de l'utilisateur (RLS) ; `group_milestone` affiché comme un créneau normal avec méta `Jalon du groupe` si `meta` est vide.
- **CL-12 — Petits écrans (< 900 px).** Colonne latérale sous le calendrier ; vue Semaine avec défilement horizontal (`min-width: 720px`), vue Mois avec pastilles réduites à des points colorés sous 600 px.

## 8. Instructions d'implémentation

1. Contrats `packages/contracts/src/agenda.ts` (ET-1) et configuration `packages/config/src/agenda.ts` (ET-3). Commit `feat(SPEC-704): contrats et types de l'agenda`.
2. Service `getAgenda` (ET-2, ET-5) et route `apps/web/app/api/v1/agenda/route.ts`. Commit `feat(SPEC-704): API agenda`.
3. Fonctions pures `apps/web/lib/agenda/*.ts` (ET-4, ET-6, ET-7) avec tests unitaires.
4. Composants `apps/web/components/agenda/` : `AgendaScreen.tsx`, `AgendaToolbar.tsx` (utilise `Select`, `SegmentedControl`, `IconButton`, `Button` de `@learny/ui`), `MiniCalendar.tsx`, `SlotDetail.tsx`, `AgendaLegend.tsx`, `AgendaTotals.tsx`, `WeekView.tsx`, `DayView.tsx`, `MonthView.tsx`, `SlotBlock.tsx`, `NowLine.tsx`.
5. Page `apps/web/app/(app)/agenda/{page,loading,error}.tsx` ; textes `apps/web/messages/fr.ts` section `agenda`. Commit `feat(SPEC-704): écran agenda`.
6. Tests (§12). Commit `test(SPEC-704): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/agenda.ts` ; `packages/config/src/agenda.ts` ; `packages/services/src/agenda/get-agenda.ts`, `packages/services/src/agenda/index.ts` ; `apps/web/app/api/v1/agenda/route.ts` ; `apps/web/app/(app)/agenda/{page,loading,error}.tsx` ; `apps/web/lib/agenda/*.ts` ; `apps/web/components/agenda/*.tsx` ; tests de §12.
- **Modifiés** : `apps/web/messages/fr.ts` ; `packages/contracts/src/index.ts` ; `packages/config/src/index.ts`.
- **Lus / réutilisés** : `schedule_slots`, `formations`, `modules`, `study_preferences`, `profiles` ; `@learny/ui` ; `packages/core/src/time.ts` ; coquille SPEC-304.

## 10. Interface et conformité visuelle

- **Maquette** : `design/maquettes/Agenda.dc.html` ; **références** : `design/references/SCR-12-desktop.png` (vue Semaine du 9 au 13 nov., sélection quiz 14:00), `SCR-12-jour-desktop.png`, `SCR-12-mois-desktop.png` (noms à aligner sur le manifeste de SPEC-005).
- **Structure (ordre DOM) et `data-testid`** :
  1. `agenda-header` : sur-titre `Toutes vos formations · semaine du 9 – 13 nov.`, `h1` `Agenda`.
  2. `agenda-toolbar` : `agenda-filter` (select), `agenda-view-jour|semaine|mois`, `agenda-prev`, `agenda-range` (`9 – 13 nov. 2026`), `agenda-next`, `agenda-today` (`Aujourd'hui`). Boutons hauteur 44 px, rayon 12 px, bordure `#E7E6E1`.
  3. Colonne latérale : `agenda-minical` (titre `Novembre 2026`, `Formation : 2 nov. – 11 déc.`, cases `agenda-minical-day-YYYY-MM-DD`) ; `agenda-detail` (fond `#111113`, titre `Activité sélectionnée` `#C6F432`, `agenda-detail-type` « Quiz de validation », `agenda-detail-title` « Quiz de validation », `agenda-detail-when` « Mercredi 11 nov. · 14:00 – 15:00 », `agenda-detail-meta` « Tentative 2 · seuil 80 % », `agenda-detail-open` « Ouvrir » (citron), `agenda-detail-move` « Déplacer ») ; `agenda-legend`.
  4. `agenda-calendar` : `agenda-totals` (« 23 h 30 prévues · … » selon les données seedées de la semaine), puis `agenda-week` (`agenda-day-header-YYYY-MM-DD`, `agenda-slot-<id>`, `agenda-now-line`) ou `agenda-day` ou `agenda-month` (`agenda-month-cell-YYYY-MM-DD`).
- **Données de démonstration** : semaine du 9 au 13 novembre identique au tableau `week2` de la maquette (y compris les créneaux « Agile · apports » mardi et jeudi 17:30) ; les totaux attendus sont calculés par le test à partir du seed avec la règle d'EF-11 et comparés au texte affiché (la maquette calcule de la même façon).
- **Jetons vérifiés** : couleurs d'ET-3 sur un créneau de chaque type présent, ligne de l'heure `#F97316` positionnée à 260 px × 0,9 du haut de la grille à 13:20, panneau détail `#111113`, bouton Ouvrir `#C6F432`, rayon des cartes 24 px, titre Space Grotesk.
- **Comparaison** : vue Semaine avec `SCR-12-desktop.png` ≤ 12 % ; vues Jour (11 nov.) et Mois (novembre) avec leurs références ≤ 12 % si fournies ; lignes de base `toHaveScreenshot('agenda-semaine.png'|'agenda-jour.png'|'agenda-mois.png')`.

## 11. Critères d'acceptation

- **CA-1** — À l'horloge de référence, `/agenda` affiche la vue Semaine du 9 au 13 nov. 2026, le libellé `9 – 13 nov. 2026`, le sur-titre exact et la sélection par défaut « Quiz de validation » 14:00 – 15:00.
- **CA-2** — La ligne de l'heure est sur la colonne du mercredi 11, à la position de 13:20, et absente des autres colonnes.
- **CA-3** — « Semaine précédente » est désactivé sur la semaine du 2 novembre et « Semaine suivante » sur celle du 7 décembre ; en vue Jour, « Jour suivant » depuis le vendredi 13 mène au lundi 16.
- **CA-4** — Cliquer l'en-tête « Lun 9 » ouvre la vue Jour du 9 nov. avec le titre `Lundi 9 nov. · module 3` ; cliquer une case du mois ouvre la vue Jour correspondante ; l'URL reflète vue, date et filtre.
- **CA-5** — Le filtre « Gestion de projet agile » ne montre que ses créneaux, met à jour le sur-titre et les totaux.
- **CA-6** — Les totaux affichés égalent ceux calculés par la règle d'EF-11 sur les créneaux de la période (contrôle croisé API ↔ interface).
- **CA-7** — « Ouvrir » mène à la cible d'ET-5 pour chaque type présent dans le seed.
- **CA-8** — Un créneau `missed` est affiché avec la mention « Manquée » ; un créneau `moved` ou `cancelled` n'est pas affiché.
- **CA-9** — `GET /agenda` refuse une plage de plus de 42 jours (400) et un filtre sur la formation d'un autre utilisateur (404).
- **CA-10** — Conformité visuelle (jetons, structure, écart ≤ 12 % en vue Semaine) et aucune violation axe serious/critical dans les trois vues.

## 12. Plan de tests

- **Unitaires** — `apps/web/lib/agenda/*.test.ts`, `describe('[SPEC-704] agenda : calculs')` : `visibleRange` (semaine 5/6/7 jours), `navTargets` (bornes, sauts de week-end en vue Jour), `rangeLabel` (même mois / mois différents / jour / mois), `gridHours`, `layoutDay` (chevauchements), `formatDuration` (`0 h`, `5 h`, `1 h 30`), `chipLabel`, `resolveAgendaState` (valeurs invalides) ; `apps/web/components/agenda/*.test.tsx`, `describe('[SPEC-704] composants agenda')` : sélection, `aria-pressed`, navigation clavier entre créneaux.
- **Intégration** — `packages/services/test/integration/agenda.test.ts`, `describe('[SPEC-704] getAgenda')` (base réelle, horloge figée, seed démo) : créneaux de la semaine, statuts filtrés (CA-8), totaux (CA-6), bornes, `href` (CA-7), fuseau `America/Toronto` (CL-1), RLS et 404/400 (CA-9).
- **End-to-end** — `apps/web/e2e/specs/p7/agenda.spec.ts` (vidéo, seed SPEC-115, horloge figée) :
  - `test('vues, navigation et détail @SPEC-704')` : CA-1, CA-2 ; clic sur un créneau → détail ; « Semaine suivante » jusqu'à la borne (CA-3) ; « Aujourd'hui » ; vue Mois ; clic sur une case → vue Jour (CA-4).
  - `test('filtre par formation @SPEC-704')` : CA-5.
  - `test('ouvrir une activité @SPEC-704')` : « Ouvrir » sur le quiz → `/formations/<sap>/modules/<m3>/quiz` (CA-7).
  - `expectNoAxeViolations` dans chaque vue.
- **Visuel** — `test('agenda conforme à la maquette @SPEC-704 @visual')` : jetons, structure, `compareWithReference(page, 'SCR-12-desktop')` ≤ 12 %, vues Jour et Mois, `toHaveScreenshot` (CA-10).
- **Non-régression** : `@SPEC-304`, `@SPEC-305`, `@SPEC-306`, `[SPEC-407]`, `[SPEC-411]`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | e2e vues `@SPEC-704` |
| CA-2 | e2e vues ; unitaire `gridHours` |
| CA-3 | unitaire `navTargets` ; e2e vues |
| CA-4 | e2e vues |
| CA-5 | e2e filtre |
| CA-6 | intégration `[SPEC-704] getAgenda` ; unitaire `formatDuration` |
| CA-7 | intégration ; e2e ouvrir |
| CA-8 | intégration |
| CA-9 | intégration |
| CA-10 | `@SPEC-704 @visual` ; axe |

## 13. Preuves attendues

`evidence/SPEC-704/` : `video/agenda-vues.webm`, `video/agenda-filtre.webm` ; captures `screenshots/semaine.png`, `jour.png`, `mois.png`, `filtre-agile.png` ; `visual/SCR-12-*-side-by-side.png` et diffs avec taux ; mesure p95 de `GET /agenda` dans `summary.md`.

## 14. Définition de terminé

Définition commune (docs/engineering/testing.md §7) ; en plus : toutes les couleurs de type proviennent des jetons (aucune valeur en dur dans les composants) ; le bouton « Déplacer » est présent et prêt à être câblé par SPEC-705.

## 15. Décisions et hypothèses

- **ADR appliqués** : ADR-0029 (créneaux du planificateur), ADR-0030 (fuseaux), ADR-0016 (pause), ADR-0046 (routes), ADR-0063, ADR-0034, ADR-0038.
- **Décision prise (ADR-0183)** : règles d'affichage de l'agenda — bornes = union des périodes des formations filtrées ; légende du mini-calendrier = période de la formation en cours quand le filtre est « Toutes » ; plage horaire min 09:00–18:00 étendue aux créneaux ; colonnes de week-end selon jours d'étude ou créneaux présents ; couleurs des 12 types ; libellé des pastilles du mois pour les autres formations `{sigle} · {HH:MM}` ; statuts `moved`/`cancelled` masqués ; sélection par défaut = prochain créneau.
- **Hypothèses** : SPEC-411 expose `listSlots` ; sinon le service lit directement `schedule_slots` via `userDb`. Le seed SPEC-115 contient les créneaux de la maquette avec leurs titres et méta exacts. Aucune route ni colonne nouvelle.
