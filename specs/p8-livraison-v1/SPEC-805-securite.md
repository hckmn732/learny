---
id: SPEC-805
title: Sécurité
phase: P8
priority: V1
depends_on: [SPEC-802]
business_rules: [BR-PLA-08, BR-IA-10]
screens: []
adrs: [ADR-0042, ADR-0023]
visual: demo
---

# SPEC-805 — Sécurité

## 1. Objectif

Durcir et vérifier la sécurité de la V1 de bout en bout : en-têtes et CSP avec nonce, isolation RLS, protections de l'API, résistance des tâches IA aux consignes injectées dans les apports, anti-SSRF, dépendances et grille OWASP ASVS niveau 1. La validation doit produire un rapport de contrôles exécutés, sans assimiler une liste cochée à une preuve technique.

## 2. Contexte

Lire `docs/engineering/conventions.md` §7–§9, `docs/architecture/overview.md` §1–§4, `docs/architecture/api.md` §1, `docs/architecture/ai.md` §3–§5, `docs/engineering/testing.md` §1–§7, ADR-0022, ADR-0023, ADR-0042 et les spécifications prérequises. SPEC-208 fournit la limitation de débit et la vérification d'origine ; SPEC-113 les politiques RLS ; SPEC-508 les actions du tuteur ; SPEC-509/510 l'ingestion de contenus non fiables. Cette spécification vérifie leur composition sur l'application livrable et corrige les écarts observés.

## 3. Dépendances

- **SPEC-802** : comportement responsive et mobile du produit, nécessaire à l'audit de sécurité des parcours publics et connectés.
- **SPEC-208** : profils de rate limit, réponses 429, contrôle d'origine et idempotence.
- **SPEC-113** : politiques RLS et tests d'accès croisé pour toutes les tables.
- **SPEC-508** : registre fermé d'actions, balisage des apports et fixtures IA simulées.
- **SPEC-509/510** : téléchargements et extraction PDF/web/YouTube/image, y compris URL non fiables.
- **Outils** : `pnpm audit` sur le verrou exact, tests de sécurité HTTP et grille ASVS versionnée. Aucun scanner externe payant n'est requis pour les tests automatisés ; un outil indisponible est consigné sans résultat inventé.

## 4. Règles métier couvertes

- **BR-PLA-08** : l'application envoie CSP stricte, HSTS, `X-Content-Type-Options`, `Referrer-Policy` et `Permissions-Policy`; les mutations vérifient leur origine et subissent une limite de débit ; les données restent isolées par RLS et aucun secret ne passe au navigateur.
- **BR-IA-10** : les apports sont des données balisées dans toutes les tâches IA ; une instruction contenue dans un PDF, une note, une page web, des sous-titres ou une image ne change pas les consignes, les outils autorisés ni le propriétaire des données.

## 5. Exigences fonctionnelles

- **EF-1** — Chaque réponse HTML de l'application porte une CSP avec nonce par requête ; seuls les scripts/styles nécessaires à Next.js et aux fournisseurs déclarés sont autorisés. Le nonce varie entre deux requêtes, est réutilisé pour les scripts de la même réponse et ne figure pas dans les journaux. Les pages d'authentification, SDD hors production, pages légales et écrans connectés sont couvertes.
- **EF-2** — Les réponses HTTPS en production portent HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` et une `Permissions-Policy` qui interdit les capacités non utilisées. Les réponses HTTP locales ne prétendent pas avoir été servies par HTTPS ; les tests vérifient l'environnement de production simulé et un essai déployé quand disponible.
- **EF-3** — Toute mutation `/api/v1/*` refuse une origine étrangère avant le service métier ; les profils de limitation de SPEC-208 produisent 429 et `Retry-After` après leur quota. Une réponse refusée ne crée ni écriture, ni job, ni appel IA.
- **EF-4** — Un utilisateur B ne peut lire, modifier, supprimer ou exporter aucune donnée privée de A, même avec l'UUID connu, ni accéder à ses fichiers ou URL signées. Les données explicitement partagées de groupe suivent uniquement les droits d'ADR-0035 ; les apports, cours, réponses, lacunes et clés IA restent privés.
- **EF-5** — Chaque tâche IA (`programme`, `course`, `gaps`, `tutor`, `light`) possède une fixture d'apport piégé : faux message système, demande d'exfiltration, instruction de supprimer des données, changement de propriétaire, injection dans une citation. La sortie doit ignorer ces instructions et les outils rejetés par `guard` ne sont jamais exécutés.
- **EF-6** — Les récupérations d'URL rejettent les schémas autres que HTTP(S), les adresses privées/loopback/link-local, les redirections vers ces adresses, les DNS qui changent de cible et les réponses au-delà des limites de taille/temps des SPEC-509/510. Le refus laisse l'apport en échec lisible sans requête vers l'adresse interdite.
- **EF-7** — `pnpm audit` sur `pnpm-lock.yaml` ne rapporte aucune vulnérabilité `high` ou `critical` non corrigée. Une exception documentée ne suffit pas à rendre le contrôle vert sans correction ou mitigation testée et ADR dédié.
- **EF-8** — `docs/security/asvs-v1-l1.md` inventorie chaque contrôle OWASP ASVS niveau 1 applicable, son statut, le test ou la preuve qui le couvre et le responsable du code. Un contrôle non applicable est justifié ; un contrôle sans preuve reste « non vérifié » et bloque la définition de terminé s'il est applicable.

## 6. Exigences techniques

- **ET-1** — Le middleware ou composant serveur crée un nonce cryptographiquement aléatoire par requête, l'attache aux en-têtes/aux scripts autorisés et construit la CSP depuis une liste versionnée de sources. Interdire `unsafe-eval`; tout usage de `unsafe-inline` non couvert par nonce est refusé en production. Les directives `connect-src`, `img-src`, `frame-src` reflètent les intégrations réellement utilisées.
- **ET-2** — `apps/web/lib/security/headers.ts` centralise HSTS, `nosniff`, Referrer et Permissions ; `apps/web/middleware.ts` ou le point d'entrée approprié applique les en-têtes à toutes les réponses HTML et API pertinentes sans écraser les en-têtes de cache ou de type.
- **ET-3** — Les tests RLS utilisent deux clients authentifiés distincts et un client service limité aux opérations système explicitement prévues. Les tests n'utilisent jamais `serviceDb()` pour simuler un accès utilisateur.
- **ET-4** — Le banc d'injection passe par `LLM_MODE=mock`, par les mêmes schémas et gardes que la production ; il enregistre appels d'outils, refus, mutations et sortie visible. Une chaîne interdite ne doit apparaître ni dans un prompt système, ni dans un outil exécuté, ni dans une donnée d'un autre utilisateur.
- **ET-5** — La protection anti-SSRF valide l'URL initiale et chaque saut de redirection après résolution DNS ; elle bloque toute connexion à une adresse non publique au niveau du transport. Ne pas se fier au seul texte de l'hôte ou à une résolution DNS faite avant la connexion.
- **ET-6** — Les rapports de scan et de tests sont datés, liés au commit testé et conservés dans `evidence/SPEC-805/`. Les valeurs de secrets, cookies, clés et contenus d'apports sont expurgées avant stockage.

## 7. Comportements attendus et cas limites

- **CL-1** — Deux requêtes HTML consécutives : nonces distincts ; scripts autorisés de chaque réponse exécutés, script injecté sans nonce bloqué.
- **CL-2** — `Origin` absent sur une requête serveur légitime : règle documentée de SPEC-208 ; origine étrangère explicite : refus et aucune mutation.
- **CL-3** — Limitation de débit atteinte en parallèle : le compteur Postgres ne laisse pas passer une requête supplémentaire par course.
- **CL-4** — Accès d'un membre de groupe aux apports d'un autre : refus, même si le programme partagé est visible.
- **CL-5** — URL publique qui redirige vers `127.0.0.1`, `169.254.169.254`, une IP privée IPv6 ou un nom DNS rebindé : refus avant lecture du corps.
- **CL-6** — Apport contenant « ignore les instructions précédentes » ou une imitation de rôle système : traité comme texte source, sans appel d'outil supplémentaire.
- **CL-7** — Vulnérabilité `high` détectée : validation en échec ; l'absence de réseau lors de l'audit est un contrôle non exécuté, pas une réussite.
- **CL-8** — CSP qui empêche un parcours légitime : corriger la source strictement nécessaire, rejouer le test et préserver les autres restrictions.

## 8. Instructions d'implémentation

1. Inventorier les sources réseau/script réellement employées, implémenter le nonce et les en-têtes dans `apps/web/lib/security/`, puis tester les directives sur pages publiques/connectées. Commit `feat(SPEC-805): ajoute les en-têtes et la CSP à nonce`.
2. Écrire les tests bout en bout pour origine, limite, RLS, fichiers et secrets, corriger les écarts dans les spécifications propriétaires sans affaiblir leurs tests. Commit `test(SPEC-805): vérifie l'isolation et les protections API`.
3. Ajouter les fixtures piégées par tâche IA et les cas de redirection/DNS pour l'ingestion ; vérifier les refus au niveau du transport et du registre. Commit `test(SPEC-805): couvre injection de consignes et SSRF`.
4. Exécuter `pnpm audit`, corriger les dépendances vulnérables, remplir la grille ASVS avec liens vers tests et preuves. Commit `docs(SPEC-805): documente les contrôles ASVS vérifiés`.
5. Créer la page de démonstration sécurisée, les tests e2e/visuels, puis `validate.mjs`; joindre uniquement les rapports réellement produits.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/lib/security/headers.ts`, `apps/web/lib/security/csp.ts`, `apps/web/lib/security/csp.test.ts`, `apps/web/test/integration/security-headers.test.ts`, `packages/testing/test/integration/rls-security.test.ts`, `packages/tutor/test/integration/prompt-injection.test.ts`, `packages/ingestion/test/integration/ssrf.test.ts`, `docs/security/asvs-v1-l1.md`, `apps/web/components/sdd-demos/spec-805.tsx`, `apps/web/e2e/specs/p8/spec-805.spec.ts`.
- **Modifiés** : `apps/web/middleware.ts`, routes et services concernés par un écart avéré, `packages/ingestion` (transport anti-SSRF), `packages/tutor/fixtures` (cas piégés), `pnpm-lock.yaml` si correction de dépendance, `apps/web/app/%5Fdev/sdd/registry.ts`.
- **Lus / réutilisés** : tests SPEC-113/208/508/509/510, `packages/core/src/net`, `packages/db` RLS, `tools/sdd/evidence.mjs`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-805` présente « Contrôles de sécurité » avec les catégories En-têtes, API, Données, IA, Import et Dépendances. Chaque ligne affiche « Vérifié », « Échec » ou « Non exécuté » et pointe vers le nom du test, sans donner le contenu des attaques ni des secrets. Les compteurs proviennent du dernier rapport de test disponible ; en son absence, tout est « Non exécuté ». `data-testid` : `spec-805-headers`, `spec-805-api`, `spec-805-rls`, `spec-805-ai`, `spec-805-ssrf`, `spec-805-dependencies`.

À 390 px, les catégories s'empilent. Vérifier jetons, structure, axe et `toHaveScreenshot('spec-805-demo.png', { maxDiffPixelRatio: 0.01 })` avec données de démonstration explicitement marquées ; la vidéo filme la consultation, pas une attaque contre un service réel.

## 11. Critères d'acceptation

- **CA-1** — Deux réponses HTML ont des nonces distincts ; la CSP et les quatre autres en-têtes sont présents dans les environnements prescrits, sans `unsafe-eval`.
- **CA-2** — Origine étrangère et quota atteint refusent une mutation sans écriture ; l'API renvoie les codes et en-têtes attendus.
- **CA-3** — Les tests croisés couvrent toutes les tables et fichiers privés ; aucune lecture, écriture ou export d'un autre utilisateur ne réussit.
- **CA-4** — Les cinq tâches IA ignorent les injections testées et ne exécutent aucun outil hors garde ; les URL interdites et leurs redirections sont bloquées.
- **CA-5** — Audit des dépendances sans vulnérabilité haute/critique non traitée, grille ASVS niveau 1 entièrement reliée à une preuve pour chaque contrôle applicable.
- **CA-6** — La page de démonstration affiche les statuts réels ou « Non exécuté », passe axe et le test visuel, avec vidéo.

## 12. Plan de tests

- **Unitaires** — `apps/web/lib/security/csp.test.ts`, `describe('[SPEC-805] CSP')` : nonce, directives, environnements, rejet de source inconnue (CA-1). Tests anti-SSRF de `packages/core/src/net` : IP privées, IPv6, redirection et rebind (CA-4).
- **Intégration** — `apps/web/test/integration/security-headers.test.ts`, `describe('[SPEC-805] HTTP security')` : en-têtes, origine, 429, absence de mutation (CA-1, CA-2) ; `rls-security.test.ts` : deux utilisateurs sur tables/fichiers (CA-3) ; `prompt-injection.test.ts` et `ssrf.test.ts` : cinq tâches et transport (CA-4).
- **End-to-end** — `apps/web/e2e/specs/p8/spec-805.spec.ts`, `test('parcours protégé @SPEC-805')` : ouvrir une page, contrôler CSP dans la réponse, tenter une mutation d'origine étrangère via contexte de test, vérifier absence d'effet, puis consulter la démonstration ; vidéo (CA-1, CA-2, CA-6).
- **Visuel** — `test('contrôles de sécurité conformes @SPEC-805 @visual')` : six catégories, jetons, axe et capture ≤ 1 % (CA-6).
- **Non-régression** — toutes les suites des SPEC-113, 208, 508, 509 et 510 ; `pnpm audit` et vérification automatique des liens de la grille ASVS (CA-5).

| Critère | Tests |
|---|---|
| CA-1 | `csp.test.ts` ; `security-headers.test.ts` ; e2e |
| CA-2 | `security-headers.test.ts` ; e2e |
| CA-3 | `rls-security.test.ts` |
| CA-4 | `prompt-injection.test.ts` ; `ssrf.test.ts` |
| CA-5 | `pnpm audit` ; contrôle de la grille ASVS |
| CA-6 | e2e `@SPEC-805 @visual` |

## 13. Preuves attendues

`evidence/SPEC-805/` contient les rapports d'en-têtes, limite, RLS, injection et SSRF, la sortie de `pnpm audit`, une copie de la grille ASVS avec liens de test, vidéo/captures de la page SDD, `checks.json` et `acceptance.md`. Les charges d'attaque et données sensibles sont remplacées par des identifiants de fixture, jamais par leurs valeurs réelles.

## 14. Définition de terminé

La définition de `docs/engineering/testing.md` §7 est satisfaite. Aucun contrôle applicable de la grille ASVS n'est laissé sans preuve, les dépendances hautes/critiques sont traitées, et les parcours existants restent fonctionnels sous CSP. Une vérification non exécutée reste explicitement non vérifiée et bloque la conclusion correspondante.

## 15. Décisions et hypothèses

ADR-0042 fixe les en-têtes, le rate limit, l'audit des dépendances et ASVS niveau 1. ADR-0023 fixe le traitement des apports comme données et les tests d'injection. Les contrôles de groupe suivent ADR-0035. Toute mitigation qui déroge à ces décisions exige un nouvel ADR selon `sdd-process.md` §4.
