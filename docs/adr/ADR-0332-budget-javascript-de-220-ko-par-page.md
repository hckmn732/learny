# ADR-0332 — Budget JavaScript de 220 Ko par page

- **Statut** : Acceptée
- **Origine** : Décision du porteur (17/11/2026)
- **Date** : 2026-11-17
- **Liens** : SPEC-804, ADR-0041, ADR-0202

## Contexte

ADR-0041 et ADR-0202 fixaient le JavaScript compressé à 200 Ko par page connectée et 130 Ko pour /connexion. Mesure du 17/11 sur le build de production (next start, gzip) : le socle Next.js 16 et React 19 pèse à lui seul environ 125 Ko compressés, avant tout code de Learny ; après réduction (pile hors ligne et contrats à la demande, formulaire de compte sans Zod), /connexion pèse 213 Ko.

## Décision

Le budget JavaScript devient 220 Ko compressés pour toutes les pages mesurées, /connexion comprise (décision du porteur). Les autres budgets d ADR-0202 (LCP, CLS, TBT, score, CSS, polices, images, requêtes) sont inchangés. budget.json, assert-lighthouse.mjs et la page de démonstration SPEC-804 portent cette valeur.

## Conséquences

Un budget sous le socle du framework n était pas atteignable ; 220 Ko laisse environ 95 Ko au code applicatif par page. Toute hausse au-delà exige un nouvel ADR.
