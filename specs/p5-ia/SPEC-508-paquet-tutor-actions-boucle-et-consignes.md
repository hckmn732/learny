---
id: SPEC-508
title: "Paquet tutor : actions, boucle et consignes"
phase: P5
priority: V1
depends_on: [SPEC-501, SPEC-504, SPEC-411]
business_rules: [BR-IA-05, BR-IA-10, BR-IA-11, BR-ACC-05, BR-ACC-06, BR-BRI-09, BR-TUT-05]
screens: []
adrs: [ADR-0021, ADR-0023, ADR-0072]
visual: demo
---

# SPEC-508 — Paquet tutor : actions, boucle et consignes

## 1. Objectif

Registre des 10 actions (docs/architecture/ai.md §3), boucle agent avec validation et 2 corrections max, isolation des données (balises), consignes par tâche avec ton et langue, fixtures de test, tests d'injection. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-IA-05, BR-IA-10, BR-IA-11, BR-ACC-05, BR-ACC-06, BR-BRI-09, BR-TUT-05), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0021, ADR-0023, ADR-0072. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-501** — registre et validation des briques.
- **SPEC-504** — génération via le fournisseur simulé.
- **SPEC-411** — lecture et écriture des résultats du moteur.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-IA-05** — Si le modèle personnel produit une brique invalide après 2 corrections automatiques, la tâche s'arrête, l'utilisateur est notifié et choisit : autre modèle de sa clé, ou IA fournie (si abonné). Aucune bascule automatique vers l'IA payante.
- **BR-IA-10** — Le contenu des apports est toujours transmis au modèle comme **donnée** balisée, jamais comme instruction ; une instruction trouvée dans un apport est ignorée.
- **BR-IA-11** — Toute brique produite par un modèle est validée par son schéma et les règles communes (BR-BRI-*). Une brique invalide est renvoyée au modèle avec l'erreur, au plus 2 fois, avant échec de la tâche.
- **BR-ACC-05** — Ton du tuteur : **vouvoiement** par défaut, **tutoiement** possible (profil). Le ton s'applique à tout texte rédigé par le tuteur (cours, discussion, corrections, messages des notifications et automatismes). Les libellés fixes de l'interface restent au vouvoiement.
- **BR-ACC-06** — Interface en **français uniquement** en V1. Langue des cours au choix (fr, en, es, de ; défaut fr) : le tuteur rédige dans cette langue quelle que soit la langue des ressources.
- **BR-BRI-09** — Une activité est un assemblage de briques valides décidé par le tuteur : cours, quiz de validation, session de quiz global, remédiation, exercice pratique, examen blanc (V1) ; mise en situation, projet fil rouge (V2).
- **BR-TUT-05** — Face à une lacune, le tuteur pose d'abord une question avant de réexpliquer.

## 5. Exigences fonctionnelles

- **EF-1** — Déclarer exactement les dix actions du registre de `docs/architecture/ai.md` §3 avec description, schéma d’entrée et sortie, garde-fou et exécution transactionnelle ; le modèle ne peut appeler aucune action non déclarée.
- **EF-2** — Assembler le contexte de tâche avec consigne système versionnée en anglais, ton `vous`/`tu`, langue des cours et passages d’apports balisés comme données ; le contenu d’un apport ne devient jamais instruction.
- **EF-3** — Valider chaque appel d’outil par Zod puis par son garde avant exécution ; retourner une erreur structurée au modèle, au plus deux corrections de la même brique.
- **EF-4** — Arrêter la boucle à la fin du tour, à douze tours, ou après deux erreurs consécutives de validation ; notifier `INVALID_OUTPUT` sans bascule automatique vers l’IA fournie.
- **EF-5** — Face à une lacune, poser une question avant de réexpliquer ; toute brique produite suit le registre de SPEC-501 et toute activité n’assemble que des briques valides.

## 6. Exigences techniques

- **ET-1** — Chaque fichier de `packages/tutor/src/tools/` exporte `{name,description,inputSchema,outputSchema,guard,execute}` ; `execute` ne reçoit qu’un contexte utilisateur contrôlé et écrit via le service applicatif.
- **ET-2** — `runTutor({task, input, ctx})` appelle `llm.generate` de SPEC-504, journalise via SPEC-507 quand disponible, compte les tours/erreurs et retourne un résultat typé ou `INVALID_OUTPUT`.
- **ET-3** — Les passages sont placés dans `<document source="…" chunk="…">…</document>` ; leurs balises et métadonnées sont échappées, et les consignes interdisent de suivre des instructions internes aux données.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Outil inconnu : refus avant toute écriture.
- **CL-2** — Payload valide Zod mais propriétaire incorrect : `guard` refuse sans révéler l’objet.
- **CL-3** — Apport contenant « ignore les instructions » : la phrase reste donnée et ne déclenche aucune action.
- **CL-4** — Treizième tour : arrêt contrôlé avec journal, sans boucle infinie.
- **CL-5** — Deux erreurs de brique : notification et choix humain exigé pour le modèle suivant.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/tutor/src/loop.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-508): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-508): …`.
5. Exécuter `validate.mjs SPEC-508`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/tutor/src/loop.ts`, `packages/tutor/src/tools/index.ts`, `packages/tutor/src/context.ts`, `packages/tutor/prompts/programme.md`, `packages/tutor/prompts/course.md`, `packages/tutor/prompts/tutor.md`, `packages/tutor/src/loop.test.ts`, `packages/tutor/test/integration/security.test.ts`, `apps/web/components/sdd-demos/spec-508.tsx`, `apps/web/e2e/specs/p5/spec-508.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-501, SPEC-504, SPEC-411.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : chronologie des tours du mock, nom d’outil, statut validation/garde/exécution, balises de source et sortie dans le ton choisi ; l’apport piégé est identifié comme donnée. Page `/_dev/sdd/SPEC-508` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Les dix actions du registre possèdent schéma, garde et sortie ; un appel inconnu n’exécute rien.
- **CA-2** — Un apport piégé ne change ni consigne, ni outil autorisé, ni données persistées dans les scénarios d’injection.
- **CA-3** — Une brique invalide est corrigée au plus deux fois ; troisième échec donne `INVALID_OUTPUT` et aucune bascule payante.
- **CA-4** — Le ton et la langue des cours apparaissent dans la sortie du mock tandis que les libellés fixes de l’interface restent français.
- **CA-5** — La démonstration montre un parcours d’outil validé et un refus avec vidéo, axe et `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/tutor/src/loop.test.ts`, `describe('[SPEC-508] Paquet tutor : actions, boucle et consignes')` : registre fermé, limites de tours et corrections, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/tutor/test/integration/security.test.ts`, `describe('[SPEC-508] service')` : action transactionnelle, propriétaire et injection, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-508.spec.ts`, `test('Paquet tutor : actions, boucle et consignes @SPEC-508')` : lancement du mock puis refus de l’apport piégé dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Paquet tutor : actions, boucle et consignes @SPEC-508 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-501]` / `@SPEC-501`, `[SPEC-504]` / `@SPEC-504`, `[SPEC-411]` / `@SPEC-411`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-508/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-508`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0021, ADR-0023, ADR-0072. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
