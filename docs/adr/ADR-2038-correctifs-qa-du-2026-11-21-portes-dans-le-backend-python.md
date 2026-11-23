# ADR-2038 — Correctifs QA du 2026-11-21 portés dans le backend Python

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-504, SPEC-513, SPEC-503, SPEC-605, SPEC-704, SPEC-2207

## Contexte

La branche hotfix/qa-openai-strict-schema (22 correctifs de QA réelle, 2026-11-21) corrigeait le backend TypeScript alors que la plupart de ses opérations sont désormais servies par Python (api/ownership.yaml). Fusionner le TypeScript ne suffisait pas : le portage Python reproduisait le comportement d'avant les correctifs. À la demande du porteur, les correctifs sont portés dans packages-py et apps/worker-py.

## Décision

1) Portés en Python : image PNG valide de la sonde de vision ; dateDuJour dans le contexte de génération du programme et ancrage des dates proposées par semaines entières ; libellé français de l'activité dans le motif de lacune (fixture de parité alignée) ; titre du chapitre transmis au planificateur (créneaux d'apports) ; banque de questions : vectorisation facultative (passages dans l'ordre du document), notionId et format du modèle non fiables et normalisés, schéma JSON de la charge de brique fourni au modèle (exporté une fois de Zod dans question_bank_payload_schemas.json), consigne de rédaction en français, journalisation des rejets et échecs, traitement immédiat des jobs du cours généré par le worker (délai 30 min). 2) Écart assumé : l'ancrage prend comme référence la date de début de la formation, à défaut le jour courant (le TypeScript prend le jour courant) ; ainsi les oracles e2e et visuels de SPEC-605, dont la formation et la fixture commencent le 2026-11-02, restent inchangés. 3) Non portés faute de cible : les réglages de sortie structurée OpenAI de session.ts (strictJsonSchema désactivé, oneOf réécrit en anyOf, null retirés, textes trop longs tronqués), car le Python n'a pas encore d'adaptateur LLM réel ; la spécification qui l'ajoutera devra les reprendre. Les correctifs web, Kong et briques React restent dans le TypeScript fusionné.

## Conséquences

Le comportement Python diverge volontairement de l'oracle TypeScript d'avant hotfix sur ces points ; les tests unitaires couvrent chaque correctif porté. La branche hotfix est supprimée après fusion.
