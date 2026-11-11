---
id: SPEC-806
title: RGPD et pages légales
phase: P8
priority: V1
depends_on: [SPEC-802, SPEC-211]
business_rules: [BR-PLA-05, BR-PLA-06, BR-ACC-02]
screens: [SCR-19]
adrs: [ADR-0045, ADR-0204]
visual: tokens
---

# SPEC-806 — RGPD et pages légales

## 1. Objectif

Publier les CGU, la politique de confidentialité et les mentions légales accessibles sans compte, versionner leur acceptation et documenter les traitements et sous-traitants. L'identité légale inconnue reste explicitement « [à compléter] » jusqu'à sa fourniture ; la mise en production ne peut la présenter comme renseignée.

## 2. Contexte

Lire `docs/product/business-rules.md` BR-ACC-02, BR-PLA-05 et BR-PLA-06, `docs/product/screens.md` §1 et §3 (SCR-19), `docs/architecture/data-model.md` §9 (`legal_acceptances`), `docs/architecture/api.md` §1, `docs/engineering/testing.md` §6–§7, ADR-0045 et ADR-0204. SPEC-211 livre export et suppression en libre-service ; SPEC-601 a déjà recueilli l'accord explicite à l'inscription. SPEC-803 peut avoir créé le pied de page et `/accessibilite` ; la présente spécification doit préserver son lien selon ADR-0204.

## 3. Dépendances

- **SPEC-802** : disposition responsive des pages publiques, contrôles mobile et composants du design system.
- **SPEC-211** : export ZIP et suppression avec annulation ; les pages légales les décrivent avec les délais réels de BR-ACC-10/11, sans chemin fictif.
- **SPEC-601/102/112** : case d'acceptation non précochée, `profiles.terms_version`, `legal_acceptances` et règles RLS. La présente spécification complète la traçabilité par version, sans refaire le flux d'inscription.
- **Informations externes** : nom, adresse, contact et hébergeur légaux sont fournis par les variables de configuration. S'ils sont absents, afficher le marqueur défini par ADR-0045 et consigner le blocage de publication ; ne jamais inventer d'entité.

## 4. Règles métier couvertes

- **BR-PLA-05** : consentement explicite, export et suppression en libre-service, registre des traitements et sous-traitants ; seuls les cookies strictement nécessaires sont utilisés, donc aucun bandeau de consentement n'est affiché.
- **BR-PLA-06** : `/legal/cgu`, `/legal/confidentialite` et `/legal/mentions` sont accessibles sans session ni redirection vers l'inscription.
- **BR-ACC-02** : la case CGU/confidentialité reste non précochée et l'acceptation enregistre date, version de chaque document et utilisateur ; une nouvelle version exige une nouvelle acceptation avant les actions qui la requièrent.

## 5. Exigences fonctionnelles

- **EF-1** — Trois pages publiques affichent titre, version, date de prise d'effet, sommaire ancré, sections complètes et lien vers les deux autres documents. Les identifiants d'ancre sont stables ; un lien profond mène à la bonne section au clavier.
- **EF-2** — Les gabarits légaux sont versionnés dans `docs/legal/` et rendus avec les variables `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOST_NAME`. Une variable vide affiche exactement « [à compléter] » à l'endroit concerné et est relevée dans le contrôle de mise en production de SPEC-808.
- **EF-3** — L'inscription affiche des liens vers CGU et confidentialité à côté d'une seule case non précochée. La validation refuse une case absente ou fausse ; l'acceptation inscrit deux lignes `legal_acceptances` (`cgu`, `privacy`) avec version exacte et horodatage de l'horloge injectable, atomiquement avec la création du profil/session.
- **EF-4** — Si la version active d'un document change, un utilisateur existant voit une demande de nouvelle acceptation avant la prochaine mutation nécessitant les CGU ; le refus laisse les données consultables et permet export ou suppression, mais aucune nouvelle formation ni appel IA. La réponse de l'API porte un code métier `LEGAL_ACCEPTANCE_REQUIRED` et les versions attendues.
- **EF-5** — Les pages expliquent les droits d'accès, d'export, de rectification et de suppression selon les capacités réellement livrées ; le lien vers Paramètres fonctionne après connexion. Les délais de l'export (15 min cible, lien 7 jours) et de la suppression (J+30, annulation) correspondent à BR-ACC-10/11.
- **EF-6** — `docs/legal/registre-traitements.md` liste finalité, données, base de traitement, durée, accès et suppression pour compte, apports, cours, progression, IA, notifications et facturation. `docs/legal/sous-traitants.md` liste les fournisseurs configurés par le produit, leur rôle et région connue ; une région inconnue est marquée « à vérifier » et bloque la publication si des données personnelles y transitent.
- **EF-7** — Le pied des pages publiques suit le registre unique d'ADR-0204 : CGU, Confidentialité, Mentions légales, Accessibilité. SPEC-806 crée les trois liens légaux si SPEC-803 n'est pas encore faite ; sinon elle conserve son quatrième lien et sa déclaration.

## 6. Exigences techniques

- **ET-1** — `packages/config/src/legal.ts` valide et exporte les quatre variables d'identité, `LEGAL_CGU_VERSION` et `LEGAL_PRIVACY_VERSION` ; les versions sont des chaînes non vides. En production, les valeurs d'identité absentes sont un échec du contrôle de prépublication, sans empêcher le rendu local des gabarits.
- **ET-2** — Le rendu Markdown passe par le composant sûr de SPEC-609 (`react-markdown` et `rehype-sanitize`) ou un équivalent serveur sans HTML brut. Aucun texte provenant d'un paramètre URL n'est interpolé dans le document.
- **ET-3** — `packages/services/src/legal/accept.ts` valide les versions soumises contre les versions actives, écrit dans une transaction et est idempotent sur `(user_id, document, version)` ; `packages/db` applique RLS et les politiques de lecture personnelle.
- **ET-4** — La vérification `requireCurrentLegalAcceptance(ctx)` s'applique au wrapper des mutations concernées, avec exemptions explicites pour connexion, lecture des pages légales, export, annulation/suppression du compte et renouvellement de l'acceptation. Le serveur, pas seulement l'UI, impose le refus.
- **ET-5** — `SiteFooter` utilise `SITE_FOOTER_LINKS` comme seule source. Il rend un `footer` et un `nav[aria-label="Informations légales"]`; l'ordre et les textes sont testés. Le composant ne charge aucun script de suivi ni cookie optionnel.
- **ET-6** — Une commande `legal:check` compare les versions en configuration, dans les gabarits et dans les tests ; elle signale les placeholders de production et les liens cassés. Elle n'écrit aucune acceptation factice.

## 7. Comportements attendus et cas limites

- **CL-1** — Visiteur non connecté : les trois pages et leurs ancres répondent 200 ; aucune session n'est créée.
- **CL-2** — Case non cochée ou version ancienne : inscription/acceptation refusée sans ligne partielle.
- **CL-3** — Double soumission de la même version : une seule acceptation logique ; l'horodatage original reste traçable.
- **CL-4** — Nouvelle version active : lecture et export possibles, mutation de formation refusée avec `LEGAL_ACCEPTANCE_REQUIRED` jusqu'à accord.
- **CL-5** — Identité légale absente en local : « [à compléter] » visible ; en prépublication : blocage externe consigné, sans fausse valeur.
- **CL-6** — SPEC-803 et SPEC-806 exécutées dans un ordre différent : les quatre liens restent présents au même ordre et aucune page n'est écrasée.
- **CL-7** — Cookie analytique ou tiers ajouté par erreur : test d'inventaire échoue ; pas de bandeau artificiel pour contourner BR-PLA-05.

## 8. Instructions d'implémentation

1. Écrire les gabarits versionnés CGU, confidentialité, mentions, le registre des traitements et la liste des sous-traitants en s'appuyant sur les capacités réellement livrées ; laisser l'identité inconnue comme placeholder. Commit `docs(SPEC-806): ajoute les documents légaux versionnés`.
2. Ajouter la configuration, les trois routes publiques et le pied commun ; respecter ADR-0204 et préserver `/accessibilite` si déjà présent. Commit `feat(SPEC-806): publie les pages légales`.
3. Implémenter la vérification des versions et l'acceptation transactionnelle, puis brancher le garde serveur sur les mutations concernées et la case d'inscription. Commit `feat(SPEC-806): trace l'acceptation des versions légales`.
4. Écrire `legal:check`, les tests de non-régression des flux d'inscription/export/suppression, les e2e et captures. Commit `test(SPEC-806): vérifie droits liens et acceptation`.
5. Valider, consigner les preuves réelles et tout blocage externe d'identité selon `sdd-process.md` §3 ; ne pas marquer une publication complète si les champs obligatoires manquent.

## 9. Fichiers et composants concernés

- **Créés** : `docs/legal/cgu.md`, `docs/legal/confidentialite.md`, `docs/legal/mentions.md`, `docs/legal/registre-traitements.md`, `docs/legal/sous-traitants.md`, `packages/config/src/legal.ts`, `packages/services/src/legal/accept.ts`, `packages/services/src/legal/accept.test.ts`, `apps/web/app/legal/cgu/page.tsx`, `apps/web/app/legal/confidentialite/page.tsx`, `apps/web/app/legal/mentions/page.tsx`, `apps/web/components/site-footer/SiteFooter.tsx` si absent, `apps/web/lib/site-footer-links.ts` si absent, `tools/legal/check.mjs`, `apps/web/e2e/specs/p8/spec-806.spec.ts`.
- **Modifiés** : `.env.example`, `apps/web/app/(auth)/layout.tsx`, `apps/web/app/(app)/layout.tsx` si le pied y figure, `apps/web/messages/fr.ts`, wrapper API des mutations, `packages/contracts/src/legal.ts`, `docs/architecture/api.md` pour la route d'acceptation, `package.json`.
- **Lus / réutilisés** : `legal_acceptances`, composants SPEC-803, export/suppression SPEC-211, inscription SPEC-601.

## 10. Interface et conformité visuelle

SCR-19 est en mode `tokens` : les pages suivent `docs/product/screens.md` §3, avec sur-titre gris 14 px, titre Space Grotesk 34 px, sommaire avant le texte, sections en cartes blanches bordées et liens visibles. À 390 px, le sommaire précède le texte sans colonne hors écran. `data-testid` : `legal-title`, `legal-version`, `legal-toc`, `legal-content`, `site-footer`. Les placeholders sont annoncés comme informations à compléter, pas masqués. Les liens sont atteignables au clavier et le focus reste visible.

`expectTokens` vérifie titres, cartes, liens et focus ; le test vérifie la structure, axe, puis `toHaveScreenshot('legal-cgu.png')`, `legal-confidentialite.png`, `legal-mentions.png` avec `maxDiffPixelRatio: 0.01` sur desktop/mobile. Aucune maquette inexistante n'est utilisée comme référence.

## 11. Critères d'acceptation

- **CA-1** — Les trois pages et leurs ancres sont accessibles sans cookie, affichent version/date et les quatre liens de pied dans l'ordre ADR-0204.
- **CA-2** — Une inscription sans case cochée ou avec version obsolète est refusée ; un accord valide écrit les deux documents, versions et dates exactes, une seule fois.
- **CA-3** — Après changement de version, une mutation de formation est refusée jusqu'à nouvel accord ; lecture, export et suppression restent possibles.
- **CA-4** — `legal:check` détecte une variable d'identité manquante en prépublication, un lien cassé et une version discordante ; aucune identité n'est inventée.
- **CA-5** — Les trois pages passent axe, la vérification des jetons et les captures desktop/mobile ; la vidéo Playwright couvre la navigation et l'acceptation.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/legal/accept.test.ts`, `describe('[SPEC-806] legal acceptance')` : versions exactes, ancienne version, double demande, exemption export/suppression (CA-2, CA-3). `packages/config/src/legal.test.ts` et `apps/web/lib/site-footer-links.test.ts` : placeholders, ordre des liens, versions (CA-1, CA-4).
- **Intégration** — `packages/services/test/integration/legal.test.ts`, `describe('[SPEC-806] legal persistence')` : deux lignes atomiques, RLS entre deux utilisateurs, garde serveur après version nouvelle (CA-2, CA-3). `apps/web/test/integration/legal-routes.test.ts` : trois GET publics, ancres et absence de redirection (CA-1).
- **End-to-end** — `apps/web/e2e/specs/p8/spec-806.spec.ts`, `test('consulte et accepte les textes légaux @SPEC-806')` : suivre les liens depuis l'inscription, revenir, laisser la case vide puis la cocher, vérifier les versions enregistrées ; vidéo (CA-1, CA-2, CA-5).
- **Visuel** — `test('pages légales conformes @SPEC-806 @visual')` : `expectTokens`, sommaire/sections/pied, axe, captures desktop/mobile à 1 % (CA-5).
- **Non-régression** — `[SPEC-601]`, `[SPEC-211]`, `@SPEC-601`, `@SPEC-803` si déjà terminée ; lancer `pnpm legal:check` (CA-4).

| Critère | Tests |
|---|---|
| CA-1 | unitaires footer ; intégration routes ; e2e |
| CA-2 | unitaires accept ; intégration persistence ; e2e |
| CA-3 | unitaires accept ; intégration persistence |
| CA-4 | configuration ; `legal:check` |
| CA-5 | e2e `@SPEC-806 @visual` |

## 13. Preuves attendues

`evidence/SPEC-806/` contient rapports, sortie `legal:check` avec valeurs sensibles masquées, vidéo de navigation/accord, captures des trois pages, `checks.json` et `acceptance.md`. Si des variables légales manquent, le rapport affiche les noms des champs manquants, sans valeur inventée ni annonce de publication prête.

## 14. Définition de terminé

Les conditions de `docs/engineering/testing.md` §7 passent pour le code et les documents. Les gabarits peuvent être validés localement avec placeholders, mais SPEC-808 ne peut publier tant que l'identité requise n'est pas fournie ; ce blocage est enregistré selon ADR-0045. Les pages publiques, le pied et l'acceptation serveur fonctionnent dans les deux ordres avec SPEC-803.

## 15. Décisions et hypothèses

ADR-0045 impose les placeholders et l'absence de bandeau pour les seuls cookies nécessaires. ADR-0204 fixe la déclaration d'accessibilité et le pied commun. Les versions des documents viennent de la configuration et sont enregistrées telles qu'acceptées ; aucun texte légal n'est présumé approuvé par le porteur tant que ses coordonnées restent à compléter.
