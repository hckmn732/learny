# SPEC-709 — critères d'acceptation

Preuves réelles produites par `node tools/sdd/validate.mjs SPEC-709` (horloge figée 2026-11-11T12:20:00Z, `LLM_MODE=mock`, horloge injectable uniquement).

- ✅ CA-1 — Un modèle `failed` n’apparaît pas dans les cinq sélecteurs ; un modèle qualifié peut être affecté puis réinitialisé sans supprimer la clé.
  - Unitaires : `packages/services/src/spec-709.test.ts` — « CA-1 — un modèle failed n’apparaît dans aucun sélecteur… » et « CA-1 — un modèle qualifié est affecté puis réinitialisé sans supprimer la clé » (13/13 tests `[SPEC-709]` réussis, `evidence/SPEC-709/unit.json`).
  - Intégration Supabase local : `packages/services/test/integration/spec-709.test.ts` — « CA-1 — un modèle failed n’est pas proposé, un modèle qualifié s’affecte puis se réinitialise » (2 clés conservées après reset, 0 ligne `ai_task_models`, `evidence/SPEC-709/integration.json`).
  - E2E : `apps/web/e2e/specs/p7/spec-709.spec.ts` — « parcours SPEC-709 » : modèle qualifié affecté à « Tuteur », pastille « Personnalisé » après rechargement, clé conservée après « Revenir aux modèles par défaut », carte « DeepSeek — Non qualifié » conservée et modèle absent des cinq sélecteurs (vidéo `evidence/SPEC-709/video/04-parcours-spec-709-desktop.webm`).
  - Capture : `evidence/SPEC-709/screenshots/01-parcours-spec-709-desktop-spec-709-parametres-modeles.png`.

- ✅ CA-2 — La carte de clé ne rend que les quatre derniers caractères et l’avertissement hors UE apparaît avant enregistrement.
  - Unitaires : « CA-2 — la carte ne rend que le masque et les quatre derniers caractères » (`sk-••••••••a91F`, aucune clé brute) et « CA-2 — la carte fournie n’a ni clé ni pastille hors UE » (`evidence/SPEC-709/unit.json`).
  - Intégration : « CA-2, CA-3 — la carte est masquée… » vérifie le masque `sk-••••••••a91F`, l’absence du secret dans tout le DTO et `outsideEu = true` (`evidence/SPEC-709/integration.json`).
  - E2E : le formulaire affiche « Traite les données hors de l’Union européenne » après le choix d’OpenAI et **avant** « Tester et qualifier » ; la carte finale contient le masque et pas la clé saisie. Axe : 0 violation (`evidence/SPEC-709/attachments/02-parcours-spec-709-desktop-axe.json`).

- ✅ CA-3 — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
  - Intégration : « CA-2, CA-3 — … données d’un autre apprenant restent invisibles » (404 `NOT_FOUND`, 0 écriture, état de Bob sans fournisseur d’Alice), « CA-3, CL-2 — deux demandes identiques ne dupliquent ni écriture ni événement » (une seule ligne `(user_id, task)`), « CL-3 — un modèle non qualifié refuse la tâche même pour un abonné » (`AI_UNAVAILABLE`, aucune bascule payante), « CL-4 — supprimer la clé retire ses affectations » (`evidence/SPEC-709/integration.json`).
  - Routes réelles : `apps/web/test/integration/spec-709-routes.test.ts` — GET masqué, PATCH idempotent (`idempotent-replayed: true`, une écriture), 400 `VALIDATION_FAILED` sans écriture, 404 `NOT_FOUND` pour la clé d’un autre apprenant, 422 `AI_MODEL_NOT_QUALIFIED` (`evidence/SPEC-709/integration.json`, 10 tests `[SPEC-709]`).
  - Unitaires : « CL-1 — un corps invalide est refusé avant toute écriture », « CL-1 — une clé d’un autre utilisateur répond 404 » (`evidence/SPEC-709/unit.json`).

- ✅ CA-4 — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.
  - Visuel : « conformité SPEC-709 @SPEC-709 @visual » compare trois régions à `design/references/SCR-15-modeles-desktop.png` (bandeau, cinq lignes de tâches, cartes fournisseurs) ; chaque ratio est ≤ 0,12 (assertion `MOCKUP_MAX_DIFF_RATIO`). Comparaisons côte à côte et diffs : `evidence/SPEC-709/visual/07-…-ai-models-principle-side-by-side.png`, `09-…-ai-models-tasks-side-by-side.png`, `11-…-ai-providers-side-by-side.png` (+ diffs 08, 10, 12).
  - Lignes de base `toHaveScreenshot` ≤ 1 % : `apps/web/e2e/__screenshots__/p7/spec-709.spec.ts/spec-709-parametres-modeles-desktop-desktop-linux.png` (1440 × 900) et `…-mobile-mobile-linux.png` (390 × 844) ; captures finales dans `evidence/SPEC-709/screenshots/`.
  - Axe : 0 violation serious/critical sur les trois exécutions (`evidence/SPEC-709/attachments/02-…-axe.json`, `13-…-axe.json`, `21-…-axe.json`).
  - Vidéos : 7 fichiers `.webm` dans `evidence/SPEC-709/video/` (dont le parcours et les deux conformités).
  - Validation complète : `evidence/SPEC-709/checks.json` (lint, typecheck, build, unit 13/13, intégration 10/10, e2e 3 réussis, visuel 2 réussis).

## Couverture unitaire

`pnpm test:unit --coverage` : `packages/services/src/**` = 74,20 % de lignes (seuil 70 %) ; `packages/services/src/parametres-modeles-d-ia.ts` = 98,96 % de lignes, 95,57 % d’instructions, 100 % de fonctions ; `packages/contracts/src/parametres-modeles-d-ia.ts` = 100 %.
