# SPEC-806 — RGPD et pages légales : critères d’acceptation

- **Branche** : `spec/SPEC-806-rgpd-et-pages-legales`
- **Date de validation** : 2026-11-17
- **Périmètre** : trois pages publiques, pied commun ADR-0204, versionnement des gabarits,
  acceptation transactionnelle et garde serveur, registre des traitements et sous-traitants.

## Critères

- ✅ **CA-1** — Les trois pages et leurs ancres sont accessibles sans cookie, affichent version/date
  et les quatre liens de pied dans l’ordre ADR-0204. Preuves : `apps/web/test/integration/legal-routes.test.ts`
  (`[SPEC-806] legal routes`), `apps/web/lib/site-footer-links.test.ts`, e2e
  `consulte et accepte les textes légaux @SPEC-806` (navigation anonyme, ancres `#objet`, quatre
  liens), captures `evidence/SPEC-806/screenshots/legal-*.png`.
- ✅ **CA-2** — Une inscription sans case cochée ou avec version obsolète est refusée ; un accord
  valide écrit les deux documents, versions et dates exactes, une seule fois. Preuves :
  `packages/services/src/legal/accept.test.ts`, `packages/services/test/integration/legal.test.ts`
  (`CA-2`), e2e `consulte et accepte les textes légaux @SPEC-806` (case non précochée, refus,
  deux lignes `cgu`/`privacy` à l’instant figé).
- ✅ **CA-3** — Après changement de version, une mutation de formation est refusée jusqu’à nouvel
  accord ; lecture, export et suppression restent possibles. Preuves :
  `packages/services/src/legal/accept.test.ts` (garde et exemptions), intégration `CA-3`
  (`LEGAL_ACCEPTANCE_REQUIRED`, versions attendues, acceptation suivante).
- ✅ **CA-4** — `legal:check` détecte une variable d’identité manquante en prépublication, un lien
  cassé et une version discordante ; aucune identité n’est inventée. Preuves :
  `tools/legal/test/unit/check.test.ts`, sortie `evidence/SPEC-806/legal-check.txt` (champs
  manquants nommés : `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL`,
  `LEGAL_HOST_NAME`), `pnpm legal:check` vert localement avec avertissement.
- ✅ **CA-5** — Les trois pages passent axe, la vérification des jetons et les captures
  desktop/mobile ; la vidéo Playwright couvre la navigation et l’acceptation. Preuves : e2e
  `pages légales conformes @SPEC-806 @visual` (jetons, sommaire avant contenu, axe, captures
  `legal-cgu.png`, `legal-confidentialite.png`, `legal-mentions.png`), vidéos sous
  `evidence/SPEC-806/video/`.

## Blocage externe

L’identité légale (nom, adresse, contact, hébergeur) n’est pas fournie : elle reste le marqueur
exact « [à compléter] ». Ce blocage de publication est consigné dans `progress/blockers.md` (B-002)
et sera contrôlé par SPEC-808. Aucune valeur n’est inventée et aucune publication V1 n’est annoncée.
