# ADR-0224 — Socle de tests SPEC-004 : projets, gardes et collecte

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-004, ADR-0047, ADR-0048, ADR-0050, ADR-0101

## Contexte

SPEC-004 complète le harnais alors que la base Supabase (SPEC-101), le design system (SPEC-301) et les fabriques n'existent pas encore ; la spécification demande aussi de refuser un mode IA réel avant tout appel, de comparer heure serveur et heure navigateur, et de collecter des pièces jointes qui, attachées en mémoire, n'ont pas de fichier à copier.

## Décision

1. Projets Playwright : desktop (tous les tests), mobile (390×844, isMobile, uniquement les tests @mobile), cross-browser-firefox et cross-browser-webkit (sélectionnés par --project=cross-browser) ; run-playwright.mjs lance desktop et mobile par défaut (ADR-0101) ; les navigateurs Firefox/WebKit et leurs dépendances système sont installés dans l'image de développement. 2. assertMockLlm refuse LLM_MODE différent de mock au chargement de vitest.config.ts et de playwright.config.ts ; TEST_SERVER_ENV (CLOCK_FIXED_AT, LLM_MODE=mock, TZ=UTC) alimente le serveur e2e. 3. L'heure serveur est exposée par la démonstration (<time datetime>) et comparée à l'heure figée de la page (expectServerTimeMatchesPage). 4. expectScreenshotBaseline applique ADR-0101 §5 : en CI, ligne de base absente → capture candidate jointe et annotation ; ligne de base présente et différente → échec. 5. captureEvidence et axeCheck écrivent leurs pièces jointes sur disque ; evidence.mjs copie images (screenshots/ ou visual/), vidéos et JSON (attachments/), noms ASCII stables suffixés du projet, et reçoit ses dossiers par options injectables. 6. Une vidéo par page : axe ouvre une page auxiliaire dans le contexte, d'où deux vidéos réelles par test qui l'appelle. 7. L'isolation de base de données par test (EF-2) et les fabriques arrivent avec SPEC-101 ; d'ici là le harnais ne fournit que horloge, gardes, MSW et rendu de composants (src/env.ts, src/render.tsx en plus des fichiers listés). 8. Seuils de couverture par motif dans vitest.config.ts, ignorés tant que le paquet n'existe pas.

## Conséquences

Les spécifications suivantes importent test, expect, expectTokens et expectScreenshotBaseline depuis @learny/testing ; les lignes de base cross-browser seront créées au checkpoint qui les exige.
