# ADR-0337 — Tuteur flottant et évaluation de `chat-demo`

- **Statut** : Acceptée
- **Origine** : Validée (demande du porteur : traiter les bugs #11 et #12, en s'inspirant de
  `https://github.com/deepseek-ai/chat-demo`)
- **Date** : 2026-11-18
- **Liens** : SPEC-610, SPEC-802, BR-TUT-01, ADR-0004, ADR-0022, ADR-0042, ADR-0059, ADR-0201

## Contexte

La recette du 18 novembre relève deux défauts du tuteur : son panneau fixe colle au bord droit,
recouvre la cloche de notifications et décale la page (#12) ; l'accès au tuteur n'existe que par la
carte de la page de cours (#11). Le porteur cite `deepseek-ai/chat-demo` comme référence et demande
un changement de framework.

`chat-demo` est une **application statique** : Rspack, React 18, Zustand, sans backend, la clé d'API
dans `localStorage`, les conversations dans IndexedDB (licence MIT). Learny est une application
Next.js avec API serveur, authentification par lien magique, RLS Postgres et clés de fournisseur
côté serveur.

## Décision

1) **Ne pas remplacer le framework de Learny par `chat-demo`.** Une SPA statique qui appelle l'API
   avec une clé du navigateur supprimerait l'authentification serveur, la RLS, le journal d'audit et
   la protection des secrets : contraire à ADR-0004 (Next.js et API intégrée), ADR-0022 (RLS),
   ADR-0042 (sécurité) et ADR-0059 (design system). Aucun code de `chat-demo` n'est copié.
2) **Porter son modèle d'interaction**, progressivement et dans la stack existante : compagnon
   flottant non modal, conversations multiples et streaming déjà fournis par SPEC-610.
3) **Phase 1 (livrée ici, bug #12)** : `ResponsivePanel` gagne les modes `floating` (carte sous
   l'en-tête, coins arrondis, marges) et `modal={false}` (la page reste interactive), plus `titleId`.
   Le panneau du tuteur devient cette carte flottante : plus de décalage `xl:pr-[500px]`, plus de
   `body.overflow` manuel, la cloche et l'en-tête restent visibles, la carte d'entrée est masquée
   pendant l'ouverture et le focus revient au bouton à la fermeture.
4) **Phase 2 (bug #11)** : bulle persistante montée dans `AppShell` sur tous les écrans connectés,
   avec un contexte dérivé de la route et un endpoint de contexte borné au cours courant
   (`profile.current_formation_id` → cours `is_current` prêt). Les conversations restent liées au
   cours (BR-TUT-01 amendée à cette étape, sans migration de schéma), la page de cours gardant sa
   carte et sa sélection de passage.

## Conséquences

La géométrie du panneau s'écarte volontairement de la maquette (tiroir pleine hauteur) : le test
visuel de SPEC-610 vérifie désormais les jetons, axe et la baseline du panneau flottant, plus la
région de maquette. La phase 2 touche toutes les pages et exige sa propre campagne de baselines
visuelles, axe et responsive ; elle fera l'objet d'un incrément dédié plutôt que d'un élargissement
silencieux de ce correctif.
