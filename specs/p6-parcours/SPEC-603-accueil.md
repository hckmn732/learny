---
id: SPEC-603
title: Accueil
phase: P6
priority: V1
depends_on: [SPEC-304, SPEC-408, SPEC-115, SPEC-411]
business_rules: [BR-PRO-02, BR-PRO-03, BR-FOR-13, BR-FOR-16]
screens: [SCR-03]
adrs: [ADR-0161, ADR-0162]
visual: mockup
---

# SPEC-603 — Accueil

## 1. Objectif

Livrer l'écran `/accueil` (SCR-03, `design/maquettes/Main.dc.html`) **sans les blocs d'automatismes** : date, titre, bouton « Nouvelle formation », carte « Votre journée » (activités du jour de toutes les formations), carte de rétention, carte « Quiz global du jour », tableau « Mes formations » avec les onglets « En cours » et « Terminées » et les actions Reprendre / Continuer / Réviser ; ainsi que l'API `GET /api/v1/home` qui fournit toutes ces données en un appel.

## 2. Contexte

L'accueil est la page d'atterrissage après connexion (`/` redirige vers `/accueil`). Les blocs d'automatismes de la même maquette sont livrés plus tard : bandeau « Le tuteur propose » (SPEC-712), échauffement (SPEC-714), « Le tuteur a agi pour vous » (SPEC-722), « Bilan de la semaine » (SPEC-720). Cette spécification prépare leurs emplacements dans la mise en page sans les afficher.

À lire : `design/maquettes/Main.dc.html` (contenu principal à partir de la ligne `<div style="max-width: 1160px…">` ; tables des deux onglets), `docs/product/business-rules.md` §PRO, §FOR, `docs/architecture/data-model.md` §2, §6, §7, ADR-0071, ADR-0075, ADR-0161, ADR-0162.

## 3. Dépendances

- **SPEC-304/305** : coquille (menu latéral, en-tête figé, `AppShell`), carte « Formation en cours » ; **SPEC-303** : `Card`, `ProgressRing`, `Tabs`, `EmptyState`, `Skeleton`, `ErrorState`, `Badge`.
- **SPEC-408** : `computeRetention(reviewLogs, validatedModules, now)` (1 et 2 mois), `formationProgress(modules)` (BR-PRO-01), `plannedVsDoneHours(slots, day)`.
- **SPEC-406** : `drawGlobalQuizSession(input)` (notions dues, lissage, plafond, formats) utilisé en mode aperçu (sans persistance).
- **SPEC-411** : lecture des notions dues et des créneaux (`packages/services/src/learning/*`), `daily_activity`.
- **SPEC-115** : seed `demo` (Alex Perrin, 3 formations en cours dont « Python pour l'analyse de données » au statut `programme_proposed`, 2 terminées, créneaux du 11 novembre) ; cette spécification le complète (sigles, couleurs, voir ET-6).
- **SPEC-201** : `handler()`, client API, TanStack Query (ADR-0063). Aucune IA.

## 4. Règles métier couvertes

- **BR-PRO-02** — Carte « Votre journée » (activités du jour toutes formations : heure, pastille de type, titre, détail, statut Fait / Dans N min / À venir ; heures prévues et faites) ; carte rétention (anneau du % à 1 mois, valeur à 2 mois) ; carte « Quiz global du jour » (notions à revoir, jeux, durée, report éventuel, « Jouer maintenant ») ; tableau des formations (titre, objectif, progression, module en cours et statut, prochaine activité, fin prévue, action).
- **BR-PRO-03** — Onglet « Terminées » : résultat final, mémorisation (rétention à 1 mois), révisions dues ou « Entretien arrêté », date de fin et durée, action « Réviser ».
- **BR-FOR-13** — Deux onglets ARIA « En cours · n » (formations `active`, `paused`, et `cadrage`/`programme_proposed`, voir BR-FOR-16) et « Terminées · n » (`completed`) ; les formations `archived` n'apparaissent pas.
- **BR-FOR-16** — Une formation au statut `cadrage` ou `programme_proposed` figure dans « En cours » avec l'action « Continuer » qui ramène respectivement à `/formations/[fid]/cadrage` et `/formations/[fid]/programme`.

## 5. Exigences fonctionnelles

- **EF-1 — En-tête de page.** Sur-titre : date du jour dans le fuseau de l'utilisateur, format « Mercredi 11 novembre » (jour de la semaine avec majuscule, sans année) ; `h1` « Votre journée d'apprentissage » ; à droite, bouton-lien citron « + Nouvelle formation » → `/formations/nouvelle`.
- **EF-2 — Carte « Votre journée »** (fond `#111113`). Titre `h2` en citron, majuscules : « Aujourd'hui · <n> activité(s) » ; à droite « <prévu> prévues · <fait> faites » (durées au format « 5 h », « 1 h 30 », « 45 min »). Liste ordonnée des créneaux du jour local (statuts `planned`, `done`, `missed` ; `moved`/`cancelled` exclus), triés par heure de début, toutes formations : heure « HH:MM » ; pastille de couleur du type (ET-5) ; titre (`schedule_slots.title`) et détail (`schedule_slots.meta`) ; pastille d'état :
  - `done` → « Fait » ;
  - créneau mis en avant (premier créneau `planned` de début ≥ maintenant dont le type n'est ni `warmup` ni `micro_session`) → ligne sur fond blanc, pastille citron « Dans <N> min » si le début est à 120 min ou moins (N = minutes arrondies au supérieur), sinon « À venir » ;
  - `planned` en cours (début ≤ maintenant < fin) → « En cours » ;
  - `planned` de type `warmup` ou `micro_session` → lien-pastille « Faire » (ancre `#echauffement` pour `warmup`, `/formations/[fid]/quiz-global?mode=micro` pour `micro_session`) ;
  - `missed` → « Manqué » ; autres → « À venir ».
  Sous la liste : bouton citron d'action du créneau mis en avant (libellé et cible selon le type, ET-4) et bouton contour « Ouvrir l'agenda » → `/agenda`. Jour sans créneau : texte « Aucune activité prévue aujourd'hui. » et seul le bouton « Ouvrir l'agenda ».
- **EF-3 — Carte rétention.** Anneau 112 px (fond `#ECECFC`, arc `#5B5BD6`) avec « <x> % » ; `h2` « Notions retenues à 1 mois » ; texte « <y> % à 2 mois. Mesuré par le quiz global sur les modules validés. ». Si la valeur à 2 mois est indisponible : « Pas encore de mesure à 2 mois. Mesuré par le quiz global sur les modules validés. ». Si aucune mesure à 1 mois : anneau vide « — » et texte « Pas encore de mesure : la rétention apparaît 30 jours après la validation d'un premier module. ». Calcul sur toutes les formations de l'utilisateur (SPEC-408), pourcentages entiers.
- **EF-4 — Carte « Quiz global du jour »** (fond `#C6F432`), pour la formation courante (`profiles.current_formation_id`, ADR-0075) : titre « Quiz global du jour » ; grand texte « <n> notions à revoir » (« 1 notion à revoir ») ; ligne « <titre formation> · <j> jeux · <d> min » suivie de « · lacunes en priorité » si la session contient au moins une lacune ; si des notions sont reportées : « <dues> notions étaient dues : <r> reportées à <jour> pour rester sous <plafond> min. » (`<jour>` = nom du jour en minuscules si dans les 6 jours, sinon « jeu. 19 nov. ») ; bouton noir « Jouer maintenant » → `/formations/[fid]/quiz-global`. `<j>` = nombre de formats distincts de la session tirée ; `<d>` = durée estimée arrondie aux 5 min supérieures. Aucune notion due : « Rien à revoir aujourd'hui » et « Prochaine révision : <date> » (ou « Les révisions commencent après la validation d'un premier module. »), sans bouton. Aucune formation courante : carte masquée.
- **EF-5 — « Mes formations ».** Section blanche : `h2` « Mes formations » ; `tablist` « Mes formations » avec « En cours · <n> » et « Terminées · <m> » ; onglet actif reflété dans l'URL (`?onglet=terminees`), défaut « En cours » ; flèches gauche/droite.
- **EF-6 — Tableau « En cours ».** Colonnes « Formation », « Progression », « Module en cours », « Prochaine activité », « Fin prévue », colonne d'action (en-tête masqué « Action »). Ordre des lignes : formation courante, puis autres `active` par `last_opened_at` décroissant, puis `paused`, puis `programme_proposed`, puis `cadrage` (par `created_at` décroissant). Cellules :
  - Formation : sigle (carré 42 px, couleurs de la formation, ADR-0162), titre, sous-titre = libellés des objectifs joints par « · » (`operational` « Être opérationnel », `exam` « Certification », `dialogue` « Dialoguer avec des experts », `project` « Livrer un projet »).
  - Progression : anneau 36 px (couleur d'accent) + « <p> % » + « Module <n> sur <N> » ; `programme_proposed` → 0 % et « Programme à valider » ; `cadrage` → 0 % et « Cadrage en cours » ; `paused` → « En pause ».
  - Module en cours : titre du module ouvert + pastille d'état : « Apports en cours » (un chapitre au moins en `in_progress`, `#E1F4EF`/`#0F6B5A`), « Cours en préparation » (cours `generating`), « Cours à lire » (lecture < 100 %), « Quiz à passer » (aucune tentative, `#ECECFC`/`#2E2E8F`), « Quiz à repasser » (dernière tentative sous le seuil, `#FFEDE0`/`#A13A06`) — première condition vraie dans cet ordre inverse : à repasser > à passer > à lire > en préparation > apports ; « — » si aucun module ouvert.
  - Prochaine activité : premier créneau `planned` futur de la formation : « Aujourd'hui, 14:00 », « Demain, 17:30 » ou « jeu. 12 nov., 09:00 » + ligne grise = libellé du type (ET-5 ; pour `contributions`, « Apports » suivi de « , chapitre <n> » si `meta` contient « chapitre <n> ») ; `programme_proposed` → « Valider le programme » / « <N> modules proposés » ; `cadrage` → « Terminer le cadrage » / « Question <k> sur 5 au plus » ; aucun créneau → « — ».
  - Fin prévue : `end_date` « 11 déc. 2026 » ; « — » si absente.
  - Action : `active` → « Reprendre » → page du module ouvert (`/formations/[fid]/modules/[mid]`, ou programme si aucun) ; bouton noir pour la première ligne, contour pour les autres ; `paused` → « Reprendre » (contour) → `/formations/[fid]/programme` ; `programme_proposed`/`cadrage` → « Continuer » (contour).
- **EF-7 — Tableau « Terminées ».** Colonnes « Formation », « Résultat », « Mémorisation », « Révisions dues », « Terminée le », action. Formation : sigle, titre, sous-titre = `description` (première ligne, 60 caractères au plus avec « … »), à défaut libellés d'objectifs. Résultat : pastille `#ECECFC`/`#2E2E8F` « Validée · <s> % » (moyenne arrondie des `module_progress.best_score`). Mémorisation : « <r> % » + « notions retenues à 1 mois » (ou « — » + « mesure à venir »). Révisions dues : `maintenance_mode = 'light'` → « <n> notions aujourd'hui » (ou « Aucune aujourd'hui ») + « entretien de mémoire » ; `stopped` → « Entretien arrêté » + « à votre demande, au bilan final » ; `null` → « Bilan à faire » + « choisissez au bilan final ». Terminée le : « 18 sept. 2026 » + « <w> semaines · <h> h » (semaines = ⌈jours calendaires de `start_date` à `completed_at` / 7⌉, heures = `volume_hours`). Action : « Réviser » → `/formations/[fid]/quiz-global` (light) ; « Voir le bilan » → `/formations/[fid]/bilan` (stopped ou null). Paragraphe sous le tableau : « Au bilan final, vous choisissez de garder un entretien de mémoire léger, ou d'arrêter les révisions. ».
- **EF-8 — États vides.** Aucune formation en cours : `EmptyState` « Aucune formation en cours » / « Dites ce que vous voulez apprendre : le tuteur conçoit votre programme. » / bouton « Créer une formation ». Aucune terminée : « Aucune formation terminée pour l'instant. ».
- **EF-9 — Emplacements réservés.** Le composant de page rend dans l'ordre : en-tête (EF-1) ; emplacement `home-slot-proposal` (SPEC-712) ; rangée [journée | colonne (rétention, quiz global)] ; rangée d'emplacements `home-slot-warmup` (SPEC-714) | colonne (`home-slot-agent-feed` SPEC-722, `home-slot-weekly` SPEC-720) ; « Mes formations ». Un emplacement vide ne rend aucun nœud DOM (la rangée vide est omise).
- **EF-10 — Chargement et erreurs.** Rendu serveur avec les données (`getHome`) ; rafraîchissement client toutes les 60 s et au retour de focus (TanStack Query, clé `['home']`) pour mettre à jour « Dans N min ». Erreur de chargement : `ErrorState` « Impossible de charger votre journée. » + « Réessayer ».

## 6. Exigences techniques

- **ET-1 — API** `GET /api/v1/home` (`packages/contracts/src/home.ts`) → `HomeDto` :
  ```ts
  { today: { date: 'YYYY-MM-DD', label: string, plannedMinutes: number, doneMinutes: number,
      slots: Array<{ id, formationId, kind: SlotKind, title, meta, startsAt, endsAt,
        status: 'planned'|'done'|'missed', state: 'done'|'next'|'ongoing'|'todo'|'missed'|'upcoming',
        minutesUntil: number|null, href: string }>,
      primaryAction: { label: string, href: string } | null },
    retention: { oneMonth: number|null, twoMonths: number|null },
    globalQuiz: { formationId, formationTitle, notionCount, gamesCount, durationMin, hasGaps,
      deferred: { dueCount, deferredCount, deferredTo: 'YYYY-MM-DD', capMin } | null,
      nextReviewOn: 'YYYY-MM-DD'|null } | null,
    formations: { ongoing: OngoingFormationRow[], completed: CompletedFormationRow[] } }
  ```
  Lecture seule, client utilisateur (RLS), limitation par défaut ; p95 < 300 ms sur le seed `demo` (mesuré en intégration, 20 appels).
- **ET-2 — Service** `packages/services/src/home/get-home.ts` : `getHome(ctx): Result<HomeDto>` agrège en au plus 6 requêtes (formations + modules + progression ; créneaux du jour ; prochains créneaux par formation via `distinct on` ; tentatives récentes ; cours et lectures ; notions dues) puis appelle les fonctions pures de SPEC-406/408 ; le jour local est calculé par `startOfUserDay`/`toUserZone` (SPEC-207) ; aucune date `new Date()`.
- **ET-3 — Fonctions pures** `packages/services/src/home/derive.ts` : `slotState(slot, now)`, `moduleStatusPill(input)`, `nextActivityLabel(slot, now, tz)`, `formatDuration(min)`, `objectiveLabels(objectives)`, `completedSummary(formation)` — testées unitairement.
- **ET-4 — Action principale** (`primaryAction`) selon le type du créneau mis en avant : `validation_quiz` « Commencer le quiz de validation » → `/formations/[fid]/modules/[mid]/quiz` ; `course` « Reprendre le cours » → `…/cours` ; `contributions` « Déposer mes apports » → module ; `exercise` « Faire l'exercice » → `…/exercices/[aid]` ; `global_quiz`, `revision`, `sprint` « Réviser maintenant » → quiz global ; `mock_exam` « Commencer l'examen blanc » → `/formations/[fid]/examen-blanc` ; `buffer`, `weekly_review` ou aucun créneau → `null`.
- **ET-5 — Types de créneaux** (`packages/ui/src/tokens/slot-kinds.ts`, partagé avec SPEC-704) : libellé et couleur de pastille sur fond sombre — `contributions` « Apports » `#14A38B` ; `course` « Cours » `#8B8BF0` ; `exercise` « Exercice » `#9FC51F` ; `validation_quiz` « Quiz de validation » `#F97316` ; `global_quiz` « Quiz global » `#B79CFA` ; `revision` « Révision » `#B79CFA` ; `sprint` « Sprint » `#B79CFA` ; `micro_session` « Micro-séance » `#B79CFA` ; `warmup` « Échauffement » `#C6F432` ; `mock_exam` « Examen blanc » `#FFFFFF` ; `buffer` « Marge de rattrapage » `#A1A1AA` ; `weekly_review` « Bilan » `#A1A1AA`.
- **ET-6 — Sigle et couleur d'une formation (ADR-0162).** Migration `packages/db/migrations/<n>_formation_monogram.sql` (copiée dans `supabase/migrations/`) : `alter table formations add column monogram text not null default '' check (char_length(monogram) <= 3)`, `add column accent_color formation_accent not null default 'indigo'` avec `create type formation_accent as enum ('indigo','green','orange','violet','teal')`. Palette (fond / texte / anneau-point) : indigo `#ECECFC`/`#3A3AA8`/`#5B5BD6` ; green `#E1F4EF`/`#0F6B5A`/`#14A38B` ; orange `#FFEDE0`/`#A13A06`/`#F97316` ; violet `#F0E9FE`/`#5B21B6`/`#8B5CF6` ; teal `#E1F4EF`/`#0B5C4D`/`#0F9F7F`. Fonction `formationMonogram(f)` : `monogram` s'il est non vide, sinon 2 premières lettres alphanumériques du titre sans accents, en majuscules. Le seed `demo` est complété : SAP/indigo, AG/green, PY/orange, XL/teal, EN/violet. Le menu latéral (SPEC-304) et les autres écrans utilisent `formationMonogram` et la palette.
- **ET-7 — Page** `apps/web/app/(app)/accueil/page.tsx` (Server Component) ; composants `apps/web/components/home/{DayCard,RetentionCard,GlobalQuizCard,FormationsTable,CompletedTable,HomeSlot}.tsx` ; `apps/web/app/(app)/page.tsx` redirige vers `/accueil`. Mise à jour de `current_formation_id` : non (l'accueil n'est pas une page de formation, ADR-0075).
- **ET-8 — Accessibilité** : tableaux avec `th scope="col"` ; anneaux `aria-hidden` doublés d'un texte ; onglets ARIA (composant `Tabs`) ; « Dans N min » mis à jour sans annonce (pas d'`aria-live` pour éviter le bruit) ; tableaux dans un conteneur défilant horizontalement (`min-width: 920px`) avec `tabindex="0"` et `aria-label`.

## 7. Comportements attendus et cas limites

- **CL-1 — Nouvel utilisateur** sans formation : carte journée vide, rétention « Pas encore de mesure… », carte quiz global masquée, EmptyState de EF-8.
- **CL-2 — Quatrième formation** : l'accueil liste toutes les formations quel que soit leur nombre (aucune limite d'affichage) ; la limite de trois est gérée par SPEC-618.
- **CL-3 — Cadrage interrompu** : ligne « Cadrage en cours », action « Continuer » → `/formations/[fid]/cadrage`.
- **CL-4 — Changement de jour** (page ouverte à 23:59) : le rafraîchissement de 60 s recalcule le jour local (date du serveur, fuseau utilisateur).
- **CL-5 — Fuseau différent** (utilisateur à `America/New_York`) : heures et jour affichés dans ce fuseau (test dédié).
- **CL-6 — Créneau déjà commencé** : « En cours » ; le créneau suivant devient le créneau mis en avant.
- **CL-7 — Formation en pause** : aucun créneau du jour (gelés) ; ligne « En pause » ; elle n'alimente pas la carte quiz global sauf si elle est la formation courante (alors la carte affiche la session normalement : les révisions restent possibles).
- **CL-8 — Formation terminée sans bilan** : « Bilan à faire », action « Voir le bilan ».
- **CL-9 — Perte de réseau** : la dernière réponse reste affichée ; l'échec de rafraîchissement ne remplace pas le contenu ; un `Toast` « Connexion perdue : les données peuvent être anciennes. » s'affiche une fois.
- **CL-10 — IA indisponible ou plafonnée** : sans effet (aucun appel IA sur l'accueil).
- **CL-11 — Formation à plusieurs** : apparaît comme les autres (statut membre `group_members.member_status`) ; jamais de données d'un autre membre.
- **CL-12 — Titre long** (120 caractères) : coupé sur deux lignes, sigle intact.

## 8. Instructions d'implémentation

1. Migration ET-6, type Drizzle, `formationMonogram`, palette `packages/ui/src/tokens/formation-accents.ts`, mise à jour du seed `demo` et du menu (SPEC-304). Commit `feat(SPEC-603): sigle et couleur des formations`.
2. Jetons `slot-kinds.ts` (ET-5).
3. Contrats `home.ts`, fonctions pures `derive.ts` + tests unitaires.
4. Service `getHome` + test d'intégration sur le seed `demo` (valeurs de la section 11) ; route `apps/web/app/api/v1/home/route.ts`. Commit `feat(SPEC-603): API de l'accueil`.
5. Composants et page ; textes dans `messages.home`. Commit `feat(SPEC-603): écran d'accueil`.
6. Tests e2e, visuel par régions (ADR-0161), axe. Commit `test(SPEC-603): …`.
7. `validate.mjs SPEC-603`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/app/(app)/accueil/page.tsx`, `apps/web/components/home/*`, `apps/web/app/api/v1/home/route.ts`, `packages/contracts/src/home.ts`, `packages/services/src/home/*`, `packages/ui/src/tokens/slot-kinds.ts`, `packages/ui/src/tokens/formation-accents.ts`, migration ET-6, tests.
- **Modifiés** : `apps/web/app/(app)/page.tsx` (redirection), `packages/db/src/schema/formations.ts`, seed `demo` (`packages/db/seed/demo/*`), carte du menu (SPEC-304) pour le sigle, `apps/web/messages/fr.ts`, `docs/architecture/data-model.md` (colonnes ajoutées, même commit).
- **Réutilisés** : `AppShell`, `Tabs`, `ProgressRing`, `EmptyState`, `ErrorState`, `Skeleton`, `Toast`, fonctions SPEC-406/408, lectures SPEC-411, `toUserZone`.

## 10. Interface et conformité visuelle

- Maquette `design/maquettes/Main.dc.html`, onglets « En cours » et « Terminées » ; références SCR-03 du manifeste SPEC-005.
- Structure : `main` > conteneur 1160 px (72,5 rem) : en-tête `[data-testid=home-header]` → `[data-testid=home-day]` + colonne (`home-retention`, `home-global-quiz`) → `home-formations` (`home-tab-ongoing`, `home-tab-completed`, lignes `home-formation-row-<fid>`, boutons `home-formation-action-<fid>`).
- Jetons : fond de page `#F4F4F1` ; carte journée `#111113` rayon 24 px padding 28 px ; lignes `#1C1C20` rayon 16 px, ligne mise en avant blanche ; pastille « Dans N min » `#C6F432` ; pastilles « Fait »/« À venir » `#2A2A30` ; carte rétention blanche bordure `#E7E6E1` ; carte quiz `#C6F432` avec texte de report `#3D5200` ; bouton « Nouvelle formation » `#C6F432` rayon 12 px hauteur 44 px ; titres Space Grotesk 34 px (`h1`), 30 px (« 14 notions à revoir ») ; lignes de tableau `#F8F8F6`.
- États : squelettes (chargement client), vide (EF-8), erreur (EF-10).
- Responsive : rangées en `flex-wrap` (journée 2/3, colonne 1/3 au-dessus de 860 px, empilées dessous) ; tableaux défilants horizontalement ; à 390 px aucune page plus large que l'écran.
- Contrôles automatisés (ADR-0161, l'écran étant complété par SPEC-712/714/720/722) : (1) jetons ; (2) structure et textes exacts sur le seed `demo` à 2026-11-11T12:20:00Z (« Mercredi 11 novembre », « Aujourd'hui · 4 activités », « 5 h prévues · 3 h faites », « Dans 40 min », « 86 % », « 79 % à 2 mois… », « 14 notions à revoir », « 18 notions étaient dues : 4 reportées à jeudi pour rester sous 15 min. », lignes SAP/AG/PY et Excel/Anglais) ; (3) comparaison **par régions** : `home-header`, `home-day`, `home-retention`, `home-global-quiz`, `home-formations` (deux onglets) comparées aux mêmes régions de la maquette capturées par le helper `compareRegions` (écart ≤ 12 % par région) ; la comparaison pleine page est faite par SPEC-722 ; (4) ligne de base `toHaveScreenshot` de la page.

## 11. Critères d'acceptation

- **CA-1** — Sur le seed `demo` et l'horloge figée, l'API `/home` renvoie : 4 créneaux, 300 min prévues, 180 min faites, rétention 86/79, quiz global 14 notions (18 dues, 4 reportées au 2026-11-12, plafond 15), 3 lignes « En cours » et 2 « Terminées » (test d'intégration).
- **CA-2** — L'écran affiche exactement les textes listés en section 10 et les cinq régions sont à ≤ 12 % de la maquette.
- **CA-3** — Les actions mènent aux bonnes routes : « Reprendre » (SAP) → module 3 ; « Continuer » (Python) → programme ; « Réviser » (Excel) → quiz global ; « Nouvelle formation » → `/formations/nouvelle` ; une formation en `cadrage` → `/formations/[fid]/cadrage`.
- **CA-4** — Les états d'un créneau (`slotState`) et les pastilles de module (`moduleStatusPill`) respectent les tables de EF-2 et EF-6 (tests tabulés, 100 % des branches).
- **CA-5** — Avec un fuseau `America/New_York`, la date et les heures affichées correspondent à ce fuseau.
- **CA-6** — Nouvel utilisateur : les états vides de EF-3, EF-4 et EF-8 s'affichent sans erreur.
- **CA-7** — `GET /home` p95 < 300 ms sur le seed `demo` ; un autre utilisateur n'obtient aucune donnée d'Alex (RLS).
- **CA-8** — Aucune violation axe serious/critical ; onglets utilisables au clavier ; `?onglet=terminees` ouvre l'onglet « Terminées ».

## 12. Plan de tests

**Unitaires**
- `packages/services/src/home/derive.test.ts` — `describe('[SPEC-603] dérivations de l'accueil')` : `slotState` (fait, en cours, mis en avant à 40 min et à 3 h, échauffement, manqué) ; `moduleStatusPill` (5 cas + priorité) ; `nextActivityLabel` (aujourd'hui, demain, date) ; `formatDuration` (45, 60, 90, 300) ; `objectiveLabels`.
- `packages/db/src/formation-monogram.test.ts` — `describe('[SPEC-603] sigle')` : sigle stocké, repli « Écologie urbaine » → « EC ».
- `apps/web/components/home/FormationsTable.test.tsx` — `describe('[SPEC-603] tableau des formations')` : ordre des lignes, libellés d'action, état vide.

**Intégration**
- `packages/services/test/integration/home.test.ts` — `describe('[SPEC-603] getHome')` : valeurs CA-1 sur seed `demo` ; isolation RLS ; utilisateur vide ; fuseau `America/New_York` ; mesure p95.

**End-to-end** (`apps/web/e2e/specs/p6/spec-603-home.spec.ts`, vidéo, seed `demo`, horloge figée)
- `test('journée d'Alex et navigation depuis l'accueil @SPEC-603')` : connexion Alex → `/` redirige vers `/accueil` ; vérifier en-tête, 4 créneaux, « Dans 40 min » ; onglet « Terminées » au clavier ; retour « En cours » ; cliquer « Continuer » (Python) → URL programme ; retour ; « Reprendre » (SAP) → URL module ; « Jouer maintenant » → URL quiz global.
- `test('accueil d'un nouvel utilisateur @SPEC-603')` : utilisateur de fabrique onboardé, sans formation → états vides ; « Créer une formation » → `/formations/nouvelle`.
- `test('passage de l'heure @SPEC-603')` : `page.clock.fastForward('00:41:00')` + rafraîchissement → le quiz de 14:00 passe « En cours ».
- axe sur les deux onglets.
- **Visuel** : `test('conformité SCR-03 par régions @SPEC-603 @visual')` : `expectTokens`, structure, `compareRegions` (5 régions + onglet Terminées) ≤ 12 %, `toHaveScreenshot` desktop/mobile.
- **Non-régression** : `@SPEC-304`, `@SPEC-305`, `@SPEC-115`, `@SPEC-408`, `@SPEC-411`.

| Critère | Tests |
|---|---|
| CA-1 | `home.test.ts` |
| CA-2 | visuel `@SPEC-603 @visual`, e2e journée d'Alex |
| CA-3 | e2e journée d'Alex, `FormationsTable.test.tsx` |
| CA-4 | `derive.test.ts` |
| CA-5 | `home.test.ts` (fuseau) |
| CA-6 | e2e nouvel utilisateur |
| CA-7 | `home.test.ts` (p95, RLS) |
| CA-8 | axe des e2e, e2e journée d'Alex (clavier, URL) |

## 13. Preuves attendues

`evidence/SPEC-603/` : vidéos des 3 tests ; captures `accueil-en-cours.png`, `accueil-terminees.png`, `accueil-vide.png`, `accueil-mobile.png` ; comparaisons par régions (`visual/SCR-03-<region>-*`) ; mesure p95 de `/home` dans `summary.md`.

## 14. Définition de terminé

Définition commune ; en plus : migration ET-6 appliquée et `data-model.md` mis à jour ; seed `demo` complété (sigles, couleurs) ; emplacements EF-9 présents pour SPEC-712/714/720/722 ; aucun appel IA déclenché par l'accueil (vérifié : 0 ligne `ai_calls` créée pendant les tests).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0030 (fuseau), ADR-0047, ADR-0063, ADR-0071 (seed), ADR-0075 (formation courante), ADR-0034.
- **ADR-0161** (créé) : comparaison par régions tant que l'écran n'est pas complet ; la pleine page revient à la dernière spécification qui complète SCR-03 (SPEC-722).
- **ADR-0162** (créé) : colonnes `formations.monogram` et `formations.accent_color` (nouvelles colonnes, signalées), palette et repli du sigle.
- Décisions locales (sans ADR, purement d'affichage) : règles de EF-2 (mise en avant, seuil de 120 min), libellés de pastilles de module, libellés d'objectifs (« Certification » pour `exam`, conforme à la maquette), sous-titre des formations terminées = description.
- Textes ajoutés : « En cours », « Manqué », états vides, « Cours en préparation », « Cours à lire », « Quiz à passer », « Terminer le cadrage », « Bilan à faire », « Voir le bilan », messages d'erreur et de réseau.
