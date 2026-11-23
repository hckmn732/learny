# Suite e2e : échecs préexistants — SPEC-2003 (CA-2)

- Date : 2026-11-21T11:46:49+00:00
- Campagne : apps/web/e2e/specs/p0/spec-006.spec.ts (@SPEC-006)

## Comparaison main / branche

| Exécution | Résultat |
|---|---|
| `main` (sans façade, API sur PORT+1) | 3 échecs : santé, 404, visuel |
| branche (web -> façade -> Hono) | 3 échecs identiques |

## Cause identifiée

La page `/_dev/sdd/SPEC-006` calcule sa santé dans le processus **web** via
`getHealth()` (apps/web/lib/health.ts). Depuis SPEC-1203 le web est un client pur de
l API : aucune requête base n'y est enregistrée, donc `database = not_configured` et
`status = degraded`. Le test attend `ok`. La ligne de base visuelle a été capturée
avant cette régression, d ou l échec `toHaveScreenshot`.

## Conséquence pour la piste

CA-2 exige la suite e2e et visuelle complète au vert. Les deux corrections possibles
sont hors du périmètre de SPEC-2003 et interdites par l invariant ADR-2008 :

1. régénérer la ligne de base visuelle (interdit : ADR-2008, ADR-0034) ;
2. changer le comportement de la page de démonstration pour qu elle interroge l API
   (changement fonctionnel d un écran, hors spécification).

Tant que ce point n est pas tranché par le porteur du projet, CA-2 ne peut pas être
prouvé et CP-20 — donc P21 à P23 — restent bloqués.
