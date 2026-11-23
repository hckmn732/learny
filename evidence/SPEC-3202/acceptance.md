# SPEC-3202 — Programme, modules et chapitres en lecture · preuves d'acceptation

- **Branche** : `spec/SPEC-3202-programme-modules-et-chapitres`
- **Worktree** : `/root/wt/SPEC-3202`
- **Environnement** : VM `learny-dev`, émulateur Android local (ADR-3018), seed SPEC-115,
  API `LLM_MODE=mock` sur `http://127.0.0.1:3001`, Supabase local.
- **Non-régression** : coquille SPEC-3102 et cache SPEC-3003 inchangés.

## 1. Ce qui est livré

| Exigence | Implémentation |
|---|---|
| EF-1 en-tête et création | `ProgrammeHeader` (sur-titre formation → sélecteur, titre « Programme », « + » iOS, FAB Android 56 dp) ; `LargeTitleHeader` accepte un sur-titre bouton (ajout rétrocompatible). |
| EF-2 carte formation | `FormationCard` : sigle, titre, pourcentage serveur, « Module 3 sur 7 · 2 nov. – 11 déc. », barre citron (`indicators.progress.percent`, BR-PRO-01). |
| EF-3 segments et import | `Segmented` « Modules / Calendrier », lien « + Importer votre programme » sous le sélecteur (correction ADR-3003), fiche de renvoi web. |
| EF-4 modules et chapitres | `ModuleAccordion` (module en cours déplié, validés/à venir repliés, verrouillé non dépliable), `ChapterRow` (Validé / N min / à venir), « Reprendre le chapitre N », ligne « Quiz de validation ». |
| EF-5 navigation | Chapitre et reprise → cours web (`courseHref` du DTO, ADR-3002 § 3 : SPEC-3302 non livrée) ; quiz → `/formations/:fid/modules/:mid/quiz`. |
| EF-6 calendrier | `ProgrammeCalendar` : grille mensuelle, points de séance (`quizOn`), jour du serveur encadré, légende, prochaine séance. |
| EF-7 pause | Bandeau « Formation en pause » + « Reprendre sur le web », « Programme à valider » (CL-1), bandeau « Formation terminée ». |
| CL-4 hors ligne | Cache persistant SPEC-3003 (programme, modules, cours), sélecteur désactivé hors ligne, bandeau global de la coquille. |
| CL-5 module long | Liste complète dans l'accordéon mesuré (hauteur animée), bouton de reprise hors du défilement du module. |
| ET-1 | `src/data/use-programme.ts` : `useMe`, `useFormationOptions`, `useFormationsList`, `useProgramme(fid)` (clé `['formation', fid, 'programme']`), `useModuleCourse(mid)`, `useSwitchFormation` (`PATCH /me/current-formation`). |
| ET-2 | `ModuleAccordion` : hauteur mesurée + Reanimated, durée 0 ms si réduction des animations, `accessibilityState.expanded`. |
| ET-3 | Aucune route d'écriture du programme : seuls `programme.get`, `modules.course`, `me.get`, `sidebar.get`, `formations.list` et `formations.current` sont appelés. |

## 2. Décisions et écarts assumés

1. **Avancement** : la maquette affiche « 38 % » ; le contrat calcule `validated / total`
   (`BR-PRO-01`). Le seed du 11/11 a **2 modules validés sur 7**, soit **29 %**, valeur renvoyée par
   l'API et affichée par l'écran (une valeur serveur ne peut pas être remplacée par un chiffre de
   maquette : ADR > BR-PRO-01 > spec > maquette). Le test d'intégration vérifie 29 %, 2 et 7 ; les
   fixtures Jest/Vitest reprennent le jeu de la maquette (38 %) pour prouver le rendu.
2. **Progression de lecture par chapitre** : `GET /formations/:fid/programme` ne porte pas la
   progression de lecture. Conformément à BR-COU-08, l'écran lit `GET /modules/:mid/course` du
   module ouvert (`CourseChapterSummary.percent`, `readingMinutes`) : 100 % → « Validé »,
   0 < p < 100 → « N min » (arrondi supérieur), 0 % → à venir.
3. **Chapitre de reprise** : premier chapitre commencé non terminé, sinon premier non commencé,
   sinon dernier. Le seed a les chapitres 1 et 2 du module 3 lus à 100 % et 3–4 à 35 % : la pile
   affiche « Reprendre le chapitre 3 », la maquette « chapitre 2 · 8 min ». Le jeu de fixtures des
   tests (chapitre 2 à 45 %, 14 min) reproduit exactement la maquette et prouve CA-2 ; le seed
   n'est pas modifiable par la piste mobile (ADR-3001).
4. **Calendrier** : la maquette montre une grille mensuelle, pas une frise hebdomadaire ; EF-6 est
   lu avec ADR-3003 (la maquette fait foi pour la structure). Le jour « aujourd'hui » est
   `programme.today`, jour civil du serveur (ET-2, BR-ACC-07), jamais l'horloge de l'appareil.
   La pile partagée répond `2026-11-23` (API locale démarrée sans `CLOCK_FIXED_AT`) ; la capture
   met donc en évidence le 23 novembre et non le 11. L'écran reste conforme : c'est la valeur
   serveur qui fait foi.
5. **Détail du module** : route `(app)/programme/module/[moduleId]`, lecture seule (statut, dates,
   seuil, chapitres, reprise), apports et quiz renvoyés au web (ADR-3002 § 3).
6. **Rafraîchissement** : `RefreshControl` (pull-to-refresh), en plus du cache et du rafraîchissement
   au retour au premier plan de SPEC-3003.
7. **Visuel** : un seul flux `@SPEC-3202 @visual` (ADR-3015 § 5), capture Modules comparée à la
   référence `design/app-mobile/exports/screens/android-03-programme.png` (barres natives masquées,
   ADR-3003 § 4). La vue Calendrier est vérifiée structurellement dans le même flux.
8. **iOS** : non exécutable sous Linux ; la disposition iOS (« + » d'en-tête, segmented control iOS,
   pastille « En cours » citron) est couverte par le thème et les tests de composants, comme déjà
   consigné par SPEC-3102.

## 3. Tests

| Niveau | Fichier | Résultat |
|---|---|---|
| Vitest `[SPEC-3202]` | `apps/mobile/src/features/programme/view-model.test.ts` | 10 tests ✅ |
| Jest `[SPEC-3202]` | `apps/mobile/test/programme/{programme-screen,module-accordion,formation-switcher,fab-layout}.test.tsx` | 18 tests ✅ |
| Intégration | `apps/mobile/test/integration/programme.int.test.ts` | 3 tests ✅ (programme seedé, 29 %, `modules.course`, `PATCH /me/current-formation`) |
| Maestro `@SPEC-3202 @visual` | `apps/mobile/e2e/flows/SPEC-3202-programme.yaml` | campagne sous verrou émulateur — voir `e2e-mobile.json` |

## 4. Validation

Rapport complet : `evidence/SPEC-3202/validate.md`, `e2e-mobile.json`, JUnit Maestro, capture et
vidéo. Critères :

- [x] CA-1 — valeurs serveur affichées (29 % = 2/7, « Module 3 sur 7 », quatre chapitres du
      module 3, module 4 verrouillé, module 2 « Validé · 91 % ») — `view-model.test.ts`,
      `programme-screen.test.tsx`, flux Maestro.
- [x] CA-2 — « Reprendre le chapitre N » ouvre le cours à ce chapitre, module verrouillé → fiche
      « Se débloque quand le quiz du module 3 est validé » — `module-accordion.test.tsx`,
      `programme-screen.test.tsx`, flux Maestro.
- [x] CA-3 — `PATCH /me/current-formation` mémorisé côté serveur, sélecteur actif/inactif —
      `programme.int.test.ts`, `formation-switcher.test.tsx`, flux Maestro.
- [x] CA-4 — création et import renvoient au web, aucune écriture du programme —
      `programme-screen.test.tsx` (`currentFormationUpdate` non appelé), flux Maestro.
- [x] CA-5 — vues Modules et Calendrier conformes à la structure de la maquette, comparaison
      visuelle sous le seuil ADR-3003 § 4 et contrôles structurels (`testID`, textes) — flux
      `@visual` et `compare.mjs`.

## 5. Reproduction

```sh
cd /root/wt/SPEC-3202
set -a; . ./.env.local; set +a
flock /tmp/learny-gradle.lock pnpm -s build:mobile:e2e
flock /tmp/learny-emulator.lock pnpm -s test:e2e:mobile --tags SPEC-3202
node tools/sdd/validate.mjs SPEC-3202 --skip-build
```
