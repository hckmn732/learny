# SPEC-3202 — Programme, modules et chapitres en lecture · preuves d'acceptation

- **Branche** : `spec/SPEC-3202-programme-modules-et-chapitres`
- **Worktree** : `/root/wt/SPEC-3202`
- **Environnement** : VM `learny-dev`, émulateur Android local (ADR-3018), horloge figée au
  11/11/2026 13:20 (Europe/Paris), données du seed SPEC-115, API `LLM_MODE=mock`.
- **Non-régression** : SPEC-3102 (coquille) et SPEC-3003 (cache) inchangées.

## 1. Ce qui est livré

| Exigence | Implémentation |
|---|---|
| EF-1 en-tête et création | `ProgrammeHeader` (sur-titre formation → sélecteur, titre « Programme », « + » iOS, FAB Android 56 dp), `LargeTitleHeader` accepte un sur-titre bouton (ajout rétrocompatible). |
| EF-2 carte formation | `FormationCard` : sigle de la formation, titre, « 38 % », « Module 3 sur 7 · 2 nov. – 11 déc. », barre citron pilotée par `indicators.progress.percent` (BR-PRO-01). |
| EF-3 segments et import | `Segmented` « Modules / Calendrier », lien « + Importer votre programme » sous le sélecteur (maquette corrigée ADR-3003), fiche de renvoi web. |
| EF-4 modules et chapitres | `ModuleAccordion` (module en cours déplié, validés/à venir repliés, verrouillé non dépliable), `ChapterRow` (Validé / N min / à venir), bouton « Reprendre le chapitre N », ligne « Quiz de validation » → web. |
| EF-5 navigation | Chapitre et reprise → cours web (`courseHref` du DTO, ADR-3002 § 3 : SPEC-3302 non livrée) ; quiz → `/formations/:fid/modules/:mid/quiz`. |
| EF-6 calendrier | `ProgrammeCalendar` : grille mensuelle, points de séance, aujourd'hui encadré, légende, prochaine séance. |
| EF-7 pause | Bandeau « Formation en pause » + « Reprendre sur le web », état vide « Programme à valider » (CL-1), bandeau « Formation terminée ». |
| CL-4 hors ligne | Cache persistant SPEC-3003 (programme, modules, cours), sélecteur désactivé hors ligne, bandeau global de la coquille. |
| CL-5 module long | Liste complète dans l'accordéon mesuré (hauteur animée), bouton de reprise hors du défilement du module. |
| ET-1 | `use-programme.ts` : `useMe`, `useFormationOptions`, `useFormationsList`, `useProgramme(fid)` (clé `['formation', fid, 'programme']`), `useModuleCourse(mid)`, `useSwitchFormation` (`PATCH /me/current-formation`). |
| ET-2 | `ModuleAccordion` : hauteur mesurée + Reanimated, durée 0 ms si réduction des animations, `accessibilityState.expanded`. |
| ET-3 | Aucune route d'écriture du programme : seuls `programme.get`, `modules.course`, `me.get`, `sidebar.get`, `formations.list` et `formations.current` sont appelés. |

## 2. Décisions et écarts assumés

1. **Progression de lecture par chapitre** : le DTO `GET /formations/:fid/programme` ne porte pas la
   progression de lecture (seulement `contributionsStatus`). Conformément à BR-COU-08, l'écran lit
   `GET /modules/:mid/course` du module ouvert (`CourseChapterSummary.percent`, `readingMinutes`) :
   `100 %` → « Validé », `0 < p < 100` → « N min » (durée restante arrondie à la minute supérieure),
   `0 %` → à venir. Aucune règle serveur n'est dupliquée.
2. **Chapitre de reprise** : premier chapitre commencé non terminé, sinon premier non commencé,
   sinon dernier chapitre. Avec le seed SPEC-115 du 11/11, le module 3 a ses chapitres 1 et 2 lus à
   100 % et 3–4 à 35 % : le bouton affiche donc « Reprendre le chapitre 3 » sur la pile de recette,
   alors que la maquette (chapitre 2 « 8 min ») correspond au jeu de fixtures des tests. L'intention
   de CA-2 (reprendre le chapitre en cours et ouvrir le cours à ce chapitre) est couverte par le
   test unitaire, le test Jest et le flux. Le seed n'est pas modifiable par la piste mobile
   (ADR-3001).
3. **Calendrier** : la maquette montre une grille mensuelle et non une frise hebdomadaire ; EF-6 est
   lu avec ADR-3003 (la maquette fait foi pour la structure) : grille de semaines, points sur les
   `quizOn`, aujourd'hui encadré, prochaine séance.
4. **Détail du module** : route `(app)/programme/module/[moduleId]`, lecture seule (statut, dates,
   seuil, chapitres, reprise), apports et quiz renvoyés au web (ADR-3002 § 3).
5. **Rafraîchissement** : `RefreshControl` (pull-to-refresh) sur l'écran, en plus du cache et du
   rafraîchissement au retour au premier plan de SPEC-3003.
6. **Visuel** : un seul flux `@SPEC-3202 @visual` (ADR-3015 § 5) ; capture Modules comparée à la
   référence `design/app-mobile/exports/screens/android-03-programme.png` et capture Calendrier à
   `exports/states/ios-programme-calendrier.png`. Les barres natives sont masquées (ADR-3003 § 4).
7. **iOS** : non exécutable sur l'environnement Linux ; la disposition iOS (action « + » dans
   l'en-tête, segmented control iOS, badge « En cours » citron) est couverte par le thème et les
   tests de composants, conformément à l'écart déjà consigné par SPEC-3102.

## 3. Tests

| Niveau | Fichier | Résultat |
|---|---|---|
| Vitest `[SPEC-3202]` | `apps/mobile/src/features/programme/view-model.test.ts` | 10 tests (statuts, reprise, durée restante, calendrier), ✅ |
| Jest `[SPEC-3202]` | `apps/mobile/test/programme/{programme-screen,module-accordion,formation-switcher,fab-layout}.test.tsx` | 18 tests, ✅ |
| Intégration | `apps/mobile/test/integration/programme.int.test.ts` | programme seedé, statuts, `GET /modules/:mid/course`, `PATCH /me/current-formation` — à exécuter avec la pile locale |
| Maestro `@SPEC-3202 @visual` | `apps/mobile/e2e/flows/SPEC-3202-programme.yaml` | à exécuter sous verrou émulateur |

## 4. Validation

Rapport complet : `evidence/SPEC-3202/validate.md`, `e2e-mobile.json`, JUnit Maestro, captures et
vidéo. Les critères CA-1 à CA-5 sont cochés ci-dessous à partir de ces artefacts.

- [ ] CA-1 — valeurs de démonstration exactes
- [ ] CA-2 — reprise du chapitre et condition de déblocage
- [ ] CA-3 — changement de formation et formation courante serveur
- [ ] CA-4 — renvois web sans écriture du programme
- [ ] CA-5 — conformité visuelle des vues Modules et Calendrier

## 5. Reproduction

```sh
cd /root/wt/SPEC-3202
set -a; . ./.env.local; set +a
flock /tmp/learny-gradle.lock pnpm -s build:mobile:e2e
flock /tmp/learny-emulator.lock pnpm -s test:e2e:mobile --tags SPEC-3202
node tools/sdd/validate.mjs SPEC-3202 --skip-build
```
