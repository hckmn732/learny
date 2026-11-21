# ADR-2008 — Oracles de non-régression et portage des tests en Python

- **Statut** : Acceptée
- **Origine** : Déduite (préparation de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-1001, ADR-0047, ADR-0048, SPEC-2001, SPEC-2302

## Contexte

ADR-1001 interdit de modifier une assertion de test existante. Or retirer le backend TypeScript retire aussi ses tests unitaires et d'intégration (environ 300 fichiers dans `packages/*`), qui doivent être portés en pytest.

## Décision

- **Oracles inchangés** : les e2e Playwright, les tests visuels, les tests d'accessibilité et les tests HTTP de contrat ne sont jamais modifiés ; ils s'exécutent contre la façade Python. Aucune ligne de base visuelle n'est régénérée.
- **Oracles exportés** : SPEC-2001 exporte, depuis le TypeScript, des jeux d'entrées/sorties de référence (fixtures JSON) pour le moteur d'apprentissage, les services et les sorties IA simulées ; les tests pytest les rejouent à l'identique.
- **Portage** : chaque test TypeScript d'un paquet retiré a un équivalent pytest qui reprend les mêmes cas et assertions ; la table `evidence/SPEC-2001/test-port-map.md` relie chaque test source à son équivalent. Un test TypeScript n'est supprimé qu'en SPEC-2302, une fois son équivalent vert.
- Étiquetage : les tests pytest portent `[SPEC-xxxx]` dans leur identifiant ; `validate.mjs` exécute pytest en plus de Vitest (SPEC-2003).
- Déterminisme : horloge figée au 2026-11-11T12:20:00Z (ADR-0047) et `LLM_MODE=mock` (ADR-0048) côté Python.

## Conséquences

L'invariant d'ADR-1001 est respecté : aucune assertion n'est affaiblie, les assertions changent seulement de langage avec une traçabilité vérifiable.
