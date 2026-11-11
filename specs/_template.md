---
id: SPEC-000
title: Titre de la spécification
phase: P0
priority: V1
depends_on: []
business_rules: []
screens: []
adrs: []
visual: demo   # mockup (écran maquetté) | tokens (écran sans maquette) | demo (page de démonstration SDD)
---

# SPEC-000 — Titre de la spécification

> Gabarit obligatoire. Toutes les sections sont requises (vérifiées par `node tools/sdd/audit.mjs`). Écrire de façon **normative** (« doit »), précise et exécutable sans autre source que le dépôt. Aucune décision ne doit rester ouverte : toute décision prise ici est soit déjà dans un ADR (le citer), soit ajoutée en section 15 **et** créée comme ADR.

## 1. Objectif

Une à trois phrases : ce que cette spécification livre et pourquoi.

## 2. Contexte

Où elle s'insère dans le produit et l'architecture ; documents de référence à lire (chemins précis : `docs/...`, `design/maquettes/...`, sections).

## 3. Dépendances

- Spécifications prérequises (doivent être `done`) et ce qu'on en utilise concrètement (paquets, tables, composants, API).
- Dépendances externes (services, bibliothèques et versions minimales, variables d'environnement) et comportement si indisponibles (mode mock / blocage documenté).

## 4. Règles métier couvertes

Liste des `BR-…` couvertes avec, pour chacune, la manière dont elle est implémentée (une ligne par règle).

## 5. Exigences fonctionnelles

`EF-1`, `EF-2`… : comportements observables par l'utilisateur ou par un appelant (API), avec valeurs exactes (libellés, défauts, bornes, formats).

## 6. Exigences techniques

`ET-1`… : schémas (Zod / SQL), signatures de fonctions, contrats d'API (méthode, chemin, entrée, sortie, codes d'erreur), événements émis/consommés, performances, sécurité, accessibilité.

## 7. Comportements attendus et cas limites

`CL-1`… : erreurs, valeurs limites, concurrence, réseau lent, données vides, double clic, reprise, fuseaux, permissions refusées, IA indisponible, etc. Pour chacun : situation → comportement attendu.

## 8. Instructions d'implémentation

Étapes numérotées et ordonnées, assez précises pour être suivies sans interprétation : fichiers à créer, fonctions à écrire, algorithme, ordre des commits atomiques suggérés.

## 9. Fichiers et composants concernés

- **Créés** : chemins exacts.
- **Modifiés** : chemins exacts et nature de la modification.
- **Lus / réutilisés** : composants, paquets, schémas existants.

## 10. Interface et conformité visuelle

- Écran(s) et maquette(s) de référence (`design/maquettes/X.dc.html`, état, référence `design/references/...png`) ou mode `tokens`/`demo`.
- Structure attendue (régions, ordre, textes exacts, `data-testid`), états (chargement, vide, erreur), responsive, accessibilité.
- Contrôles visuels automatisés (docs/engineering/testing.md §6) : jetons vérifiés, éléments structurels, comparaison (seuil), ligne de base.
- Pour `demo` : contenu de la page `/_dev/sdd/SPEC-000` qui démontre la capacité.

## 11. Critères d'acceptation

`CA-1`, `CA-2`… (au moins 3) : vérifiables et mesurables, chacun relié à au moins un test de la section 12.

## 12. Plan de tests

- **Unitaires** (`[SPEC-000]` dans le `describe`) : fichier, cas, résultat attendu.
- **Intégration** (`[SPEC-000]`) : fichier, cas, résultat attendu.
- **End-to-end** (`@SPEC-000` dans le titre, vidéo) : fichier `apps/web/e2e/specs/...`, scénario pas à pas, résultat attendu.
- **Visuel** (`@SPEC-000 @visual`) : contrôles et seuils.
- **Non-régression** : étiquettes de spécifications antérieures à rejouer.
- Tableau de traçabilité `CA-x → test(s)`.

## 13. Preuves attendues

Vidéo(s) (scénario filmé), captures nommées, comparaisons visuelles, mesures à consigner dans `evidence/SPEC-000/`.

## 14. Définition de terminé

Rappel de la définition commune (docs/engineering/testing.md §7) + conditions propres à cette spécification.

## 15. Décisions et hypothèses

ADR appliqués ; décisions prises dans cette spécification (et ADR créés) ; hypothèses explicites. Aucune question ouverte.
