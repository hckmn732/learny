# SPEC-404 — critères d'acceptation

- ✅ CA-1 — Une tentative qualifiante sous 80 % détecte une lacune ; sans tentative et avec une
  maîtrise basse, aucune détection n'a lieu. Preuve : `packages/learning-engine/src/gaps/detect.test.ts`
  (« détecte une lacune sous 80 % après une tentative de validation », « ne détecte rien sans
  tentative, même avec une maîtrise basse (CL-1) ») et `test/integration/gaps.test.ts`
  (« compose la maîtrise calculée et la détection ») ; e2e `@SPEC-404` vérifie
  « Lacune active » et la maîtrise calculée 32,22 %. Sorties : `unit.json`, `integration.json`,
  `e2e.json`.
- ✅ CA-2 — Une erreur normalisée répétée dans deux tentatives détecte la lacune ; deux erreurs
  d'une seule tentative ne le font pas. Preuve : tests unitaires « détecte une réponse ouverte
  normalisée répétée sur deux tentatives », « ne déclenche pas deux erreurs identiques dans une
  seule tentative (CL-3) », « détecte le même distracteur choisi dans deux tentatives » et
  intégration « compose la répétition d'erreur normalisée sur deux tentatives (CA-2) ».
- ✅ CA-3 — Les quatre natures, leur priorité (confusion > application > incompréhension > oubli)
  et les actions BR-LAC-04 sont déterminées exactement. Preuve : tests unitaires `it.each` sur les
  quatre natures, « applique la priorité confusion > application > incompréhension > oubli »,
  « signale un oubli quand la réussite précède l'échec de sept jours ou plus » et intégration
  « compose un lapse FSRS et la nature oubli (CA-3) » ; l'e2e affiche Confusion et la remédiation
  « Question d'opposition et comparaison côte à côte ».
- ✅ CA-4 — Deux réussites à 24 h et une maîtrise de 80 % lèvent la lacune ; 23 h 59 ou 79,99 % ne
  la lèvent pas. Preuve : tests unitaires « lève avec deux réussites à 24 h et 80 % de maîtrise »,
  « maintient la lacune à 23 h 59 (CL-4) », « maintient la lacune à 79,99 % de maîtrise »,
  propriété fast-check sur les intervalles, et intégration « compose la levée avec des réussites du
  moteur et le seuil (CA-4) » ; l'e2e montre 23,98 h maintenue puis 24,00 h levée avec
  l'événement `cleared`.
- ✅ CA-5 — La démonstration montre détection, nature et levée avec vidéo, axe et test `@visual`.
  Preuve : `apps/web/e2e/specs/p4/spec-404.spec.ts` (2 tests, 3 exécutions desktop/mobile sans
  violation axe serious/critical), vidéos Playwright dans `evidence/SPEC-404/video/`, captures
  desktop/mobile dans `screenshots/`, comparaison `toHaveScreenshot` à 1 % avec les lignes de base
  `apps/web/e2e/__screenshots__/p4/spec-404.spec.ts/spec-404-demo-{desktop,mobile}-linux.png`.
