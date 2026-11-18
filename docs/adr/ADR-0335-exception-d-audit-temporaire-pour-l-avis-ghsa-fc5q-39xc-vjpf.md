# ADR-0335 — Exception d audit temporaire pour l avis GHSA-fc5q-39xc-vjpf sur picomatch

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-18
- **Liens** : SPEC-805, SPEC-011

## Contexte

Le job Sécurité de la CI exécute 'pnpm audit --audit-level=high' et échoue sur GHSA-fc5q-39xc-vjpf (ReDoS dans picomatch ≤ 4.0.7). L'avis n'a aucune version corrigée en amont : le champ 'Patched versions' vaut '<0.0.0', donc aucune mise à jour ne peut fermer l'alerte. Les deux chemins qui atteignent le paquet sont exclusivement des outils de développement : '@next/eslint-plugin-next → fast-glob → micromatch → picomatch' et 'eslint-plugin-tinyglobby → tinyglobby → picomatch'. Aucun de ces paquets n'est chargé par le serveur Next ni par le worker en production ; le code applicatif n'analyse pas d'expression régulière fournie par un utilisateur avec picomatch.

## Décision

Déclarer l'exception une seule fois, de façon nominative : `auditConfig.ignoreCves: [GHSA-fc5q-39xc-vjpf]` dans `pnpm-workspace.yaml` (mécanisme pnpm, qui couvre aussi les audits locaux), et la rappeler explicitement dans le step 'Audit des dépendances' de .github/workflows/ci.yml : 'pnpm audit --audit-level=high --ignore GHSA-fc5q-39xc-vjpf'. L'exception ne couvre que cet avis, jamais une famille d'avis ni un paquet entier. Elle est revue au 2027-02-28, et retirée dès que l'une de ces conditions est remplie : (a) une version de picomatch publie un correctif ('Patched versions' ne vaut plus '<0.0.0') ; (b) un chemin de production atteint picomatch ; (c) eslint-plugin-tinyglobby ou @next/eslint-plugin-next cessent de dépendre de picomatch. Le seuil 'high' reste inchangé pour tous les autres avis, et le garde-fou runtime reste l'audit de production (pnpm audit --prod) là où il est exécuté.

## Conséquences

La CI redevient verte sans masquer les autres avis : tout nouvel avis high ou critical échoue toujours. L'exception est traçable (ADR + commentaire dans le workflow) et sa date de revue est explicite, donc elle ne peut pas devenir permanente par oubli. Le jour où un correctif amont sort, 'pnpm audit' rappellera l'avis et l'option devra être retirée : l'ADR fixe cette condition de sortie.
