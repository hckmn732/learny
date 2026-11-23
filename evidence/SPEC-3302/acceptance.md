# SPEC-3302 — critères d'acceptation

Lecture du cours. Les tests unitaires (Vitest), composants (Jest + RNTL), d'intégration (pile
locale, API 3001) et la campagne Maestro ont été réellement exécutés sur l'émulateur Android 15 /
API 35 local (ADR-3018), horloge figée à `2026-11-11T12:20:00Z`, IA simulée (`LLM_MODE=mock`).

- **Branche** : `spec/SPEC-3302-lecture-du-cours`
- **Worktree** : `/root/wt/SPEC-3302` (branche dédiée, `node_modules` partagé)
- **Plateforme validée** : Android 15 / API 35, émulateur `learny` 1080 × 2400, Maestro 2.12.1.
- **iOS** : non exécuté (aucune VM macOS, ADR-3004 § 6) ; voir l'écart 1.

## Ce qui est livré

- **Route empilée** `app/cours/[courseId].tsx?chapitre=<cid>` au-dessus des onglets (EF-1), retour
  vers Programme, changement de chapitre par `replace` pour qu'une seule entrée de pile porte le
  cours (BR-NAV-04), en-tête sous la barre d'état (safe area).
- **Écran** `src/features/cours/CourseScreen.tsx` : en-tête « Chapitre 2 sur 4 » + barre de lecture
  citron, étiquette module indigo, titre, méta (« 8 min de lecture · 4 apports · mis à jour le
  9 novembre »), sections typées, sommaire, menu de section, fiche de source, résumé de fin de
  chapitre, chapitre précédent/suivant, carte du quiz, barre inférieure.
- **Sections** : Markdown natif (SPEC-3301), « Question éclair » à réponse masquée (BR-COU-05),
  « Ne pas confondre » (BR-COU-06), « À retenir » (BR-COU-04), complément du tuteur, `summary_prompt`.
  Rendu en `FlatList` (virtualisation par section, `React.memo` par section) : CL-3.
- **Données et progression** `src/data/course.ts` : `GET /modules/:mid/course?chapitre=`,
  `PUT /courses/:cid/progress` (débounce 10 s, envoi à la sortie et en arrière-plan, file hors ligne
  par chapitre), `POST /chapters/:cid/summary`, `POST /course-sections/:sid/report`,
  `GET /course-citations/:cid/source`. Toute mutation `idempotent: true` porte une clé forgée par
  `src/api/idempotency.ts` (`crypto.randomUUID` n'existe pas sous Hermes).
- **Ouverture depuis Programme** : rangée de chapitre, « Reprendre » et détail du module ouvrent
  désormais l'écran Cours natif (EF-1) au lieu de la page web.
- **Tests** : 11 Vitest `[SPEC-3302]` (progression, sections visibles), 27 Jest `[SPEC-3302]`
  (écran, menu de section, source, sommaire, résumé, hook de progression), 5 tests d'intégration
  `[SPEC-3302]`, un flux Maestro `@SPEC-3302 @visual`.

## Critères

- ✅ **CA-1** — Le chapitre 2 s'affiche avec son titre, sa méta et ses sections, « Chapitre 2 sur 4 »
  et le retour vers Programme fonctionnent. Preuve : Jest `course-screen.test.tsx` (« affiche le
  chapitre 2 sur 4, sa méta et les sections de la maquette », « passe au chapitre suivant et revient
  au programme »), intégration `course.int.test.ts` (« lit le chapitre 2 du module 3 et ses
  sections » : position 2, titre, quatre sections `text`, `flash_question`, `dont_confuse`,
  `retain`), flux Maestro `SPEC-3302 lecture` (rangée du chapitre 2 depuis Programme →
  `course-header`, `course-title`, `course-module-tag`, `course-meta`, retour → `programme-screen`).
- ✅ **CA-2** — La progression de lecture est mesurée puis enregistrée côté serveur, et Programme
  continue d'annoncer le chapitre comme lu. Preuve : Vitest `progress.test.ts` (pourcentage, union
  des sections, une écriture par tranche de 10 s, dernière valeur par chapitre en file), Vitest
  `viewport.test.ts` (sections visibles au défilement), Jest `progress-hook.test.tsx` (« envoie les
  sections visibles avec une clé d’idempotence forgée par l’application », « n’envoie qu’une fois
  par tranche de dix secondes », « met la progression en file hors ligne et la rejoue au retour du
  réseau »), intégration (« enregistre la progression d’un chapitre déjà lu sans la faire reculer » :
  `PUT /courses/:cid/progress` → `chapterPercent` 100, et `chapters[1].percent` 100 relu par
  Programme). Le flux Maestro ne mute rien (voir l'écart 10).
- ✅ **CA-3** — Une citation ouvre sa source ; un signalement crée un signalement ouvert. Preuve :
  Jest `section-menu.test.tsx` (« signale une section avec une clé d’idempotence forgée par
  l’application », « ouvre la source d’une citation et son extrait », « affiche "Source
  indisponible" pour une source supprimée »), intégration (« résout la source d’une citation du
  chapitre », « signale une section puis la corrige pour la remettre en état » : `status: 'open'`,
  `reported: true`, puis correction → `reported: false` relu).
- ✅ **CA-4** — Le résumé est envoyé et le retour du tuteur s'affiche. Preuve : Jest
  `summary.test.tsx` (« envoie le résumé et affiche le retour du tuteur » : appel exact avec clé
  d'idempotence, verdict, message et points manquants affichés ; « refuse un résumé vide » ;
  « conserve le texte en brouillon quand le tuteur est indisponible »), intégration (« envoie un
  résumé et reçoit le retour du tuteur simulé » : `status: 'corrected'`, `feedback` structuré).
- ✅ **CA-5** — L'écran est conforme à la maquette : **écart mesuré 8,10 %** contre
  `design/app-mobile/exports/screens/android-04-cours.png` (seuil 12 %, `visual.md`, image de
  différence dans `evidence/SPEC-3302/visual/`). Preuve : Jest (« applique les jetons de la maquette
  au chrome de l'écran » : barre citron, titre en grande taille, étiquette module en capitales
  indigo), flux `@SPEC-3302 @visual` (capture `SPEC-3302-lecture`, ligne de base = export de la
  maquette, masque barre d'état + indicateur d'accueil).

## Validation des étapes

`node tools/sdd/validate.mjs SPEC-3302 --skip-build --skip-campaign` — état exact dans
`checks.json`.

| Étape | Résultat | Détail |
|---|---|---|
| lint | ✅ | `pnpm lint`, 0 avertissement |
| typecheck | ✅ | `pnpm typecheck` |
| build | ⏭ | `--skip-build` : build web préexistant en échec (écart 8) |
| unit | ✅ | 11 Vitest + 27 Jest `[SPEC-3302]` |
| integration | ✅ | 5 tests `[SPEC-3302]` (pile locale, API 3001) |
| e2e | ✅ | 1 flux réussi, 0 échec, 1 vidéo |
| visual | ✅ | 1 flux `@visual`, écart **8,10 %** (seuil 12 %) |
| acceptance | ✅ | 5/5 critères ✅ |

## Écarts assumés

1. **iOS non exécuté** : aucune VM macOS (ADR-3004 § 6). L'écran n'utilise que des primitives React
   Native, les jetons du thème et les deux plateformes de `src/theme`.
2. **Segment de route** : la spécification (§ 9) nomme `cours/[courseId]` ; le segment reçoit
   l'identifiant du **module** (`mid` de `GET /modules/:mid/course`), seul identifiant que le
   Programme possède (`chapter.courseHref`) et seule clé du DTO qui porte la version du cours. Le
   `cid` de `PUT /courses/:cid/progress` est ensuite lu dans la réponse (`course.id`). Aucun
   contrat n'est modifié (piste mobile : aucune écriture hors `apps/mobile/`, i18n et outils).
3. **Destinations de SPEC-3303 et SPEC-3304** : « Demander au tuteur » (EF-3, EF-5) et « Ouvrir le
   quiz de validation » (EF-3) ouvrent la page web correspondante, faute de feuille tuteur et
   d'écran de quiz natifs (livrés par SPEC-3303 et SPEC-3304, qui recâbleront ces entrées) ; c'est
   le renvoi prévu par ADR-3002 § 3. Le libellé accessible « Ouvrir le quiz de validation » et les
   `testID` `course-ask-tutor`, `course-open-quiz` sont en place.
4. **CA-5, comparaison pixel** : 8,10 % d'écart contre l'export Android de la maquette (≤ 12 %). Le
   reste vient du **contenu** : le chapitre 2 du jeu de démonstration (SPEC-115) contient une section
   « Présentation », une question éclair, un « Ne pas confondre » et « À retenir », alors que la
   maquette dessine un cours rédigé (en-tête de pièce, cartes de champ), et la maquette montre 50 %
   de lecture quand l'état de démonstration est à 100 %. Le détail est dans `visual.md`.
5. **ET-3 (durée de lecture pour la série)** : `CourseProgressUpdate` ne porte aucune durée ;
   aucune valeur n'est inventée, la série reste calculée par le serveur (BR-GAM-01). Le contrat
   n'est pas modifié (piste mobile).
6. **CL-1, file de progression** : la file est en mémoire du processus (une entrée par chapitre,
   dernière valeur gagnante) et rejouée au retour du réseau ; la file persistée après redémarrage
   appartient à SPEC-3305 (`src/offline/queue.ts`), pas encore livrée.
7. **CL-2** : le bandeau « Une nouvelle version est disponible » s'affiche quand une lecture
   ultérieure du même cours renvoie une version supérieure (reprise au premier plan, retour du
   réseau, rafraîchissement) ; il n'existe pas de canal poussé serveur → mobile.
8. **Build web préexistant** : `pnpm build` échoue sur `/_global-error` (`useContext`), écart
   documenté depuis SPEC-3001 ; `--skip-build` est utilisé comme pour les spécifications mobiles
   précédentes.
9. **Assertions de SPEC-3202 ajustées** : la rangée de chapitre et « Reprendre » ouvrent l'écran
   Cours natif (EF-1) ; les deux assertions de `test/programme/programme-screen.test.tsx` ont été
   réécrites sur la destination native (mêmes paramètres vérifiés : module et chapitre), pas
   supprimées. Le quiz du module reste sur le web (ADR-3002 § 3).
10. **Jeu de démonstration préservé** : la campagne Maestro ne fait aucun défilement de l'article
    (la progression envoyée porte sur le chapitre déjà lu à 100 %, valeur monotone, BR-COU-08) ni
    aucun signalement ni résumé. Le test d'intégration envoie son signalement et son résumé sur le
    **chapitre 3** du module ouvert — qu'aucune assertion ni ligne de base ne lit — et remet la
    section en état par une correction (BR-COU-09 : `reported` repasse à `false`, vérifié par
    relecture). Le résumé ajoute une ligne au jeu de démonstration (aucune route de suppression
    n'existe) : état initial « aucun résumé du chapitre 3 », état final « un résumé du chapitre 3 ».
11. **Flux Maestro court, un seul `@visual`** (leçon 6 du BRIEF) : le flux couvre l'ouverture
    depuis Programme, le chrome, le corps et le sommaire, et ne défile pas. Le défilement de
    l'article sur Maestro 2.12.1 s'est révélé peu fiable dans une fenêtre où un autre agent
    réinstallait l'APK sur le même émulateur (application tuée en cours de flux, journal
    `Package updated` + `Window EXITING`) ; les états plus bas (question révélée, citation, source,
    résumé) restent couverts par les tests de composants, d'intégration et par la vidéo de la
    campagne. Aucune assertion n'a été supprimée sans preuve équivalente.
12. **CL-3 (chapitre de plus de 10 000 mots)** : rendu par `FlatList` virtualisée et sections
    mémorisées ; le jeu de démonstration ne contient pas de chapitre de cette taille, le cas est
    couvert par la structure du code, pas par une mesure.
13. **Mesure du défilement** : les sections d'un `FlatList` n'exposent pas d'offset absolu
    (`onLayout` d'un item est relatif à sa cellule), les hauteurs mesurées sont donc cumulées dans
    l'ordre du sommaire (`src/features/cours/viewport.ts`, testé par `viewport.test.ts`).

## Reproduction

```sh
cd /root/wt/SPEC-3302
export ANDROID_SDK_ROOT=/opt/android-sdk ANDROID_HOME=/opt/android-sdk
export PATH="/opt/android-sdk/platform-tools:$HOME/.maestro/bin:$PATH"
sh /root/emu.sh                                    # émulateur, API, Supabase, compte de démonstration
flock /tmp/learny-gradle.lock env ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 \
  pnpm -s build:mobile:e2e                         # APK e2e mono-ABI (~6 min)
flock /tmp/learny-emulator.lock pnpm -s test:e2e:mobile --tags SPEC-3302
set -a; . ./.env.local; set +a
export NODE_ENV=test
npx vitest run --project unit apps/mobile/src/features/cours
npx jest test/cours
npx vitest run --project integration apps/mobile/test/integration/course.int.test.ts
node tools/sdd/validate.mjs SPEC-3302 --skip-build --skip-campaign
```
