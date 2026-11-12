# ADR-0253 — Validation des fuseaux IANA et repli de détection

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-207, SPEC-202, SPEC-602, ADR-0030

## Contexte

Node et les navigateurs normalisent certains noms vers leur alias historique : Intl.supportedValuesOf('timeZone') liste Asia/Calcutta, Europe/Kiev ou Asia/Saigon, et resolvedOptions() renvoie ces noms, si bien qu'un contrôle par égalité avec le nom canonique (isValidIanaZone) refuse Asia/Kolkata, Europe/Kyiv, Asia/Ho_Chi_Minh, America/Argentina/Buenos_Aires ou Asia/Kathmandu. Intl accepte aussi des décalages fixes (+01:00) et des variantes de casse (europe/paris) qui ne sont pas des noms IANA (SPEC-207, EF-2, EF-7, CL-1).

## Décision

parseTimeZone (utilisé par toutes les fonctions de time.ts) accepte un nom valide pour isValidIanaZone, ou un nom de forme tzdb (mots capitalisés séparés par / _ -) que Intl sait construire ; il refuse la chaîne vide, les décalages fixes, les variantes de casse et les noms inconnus par une AppError VALIDATION_FAILED (chemin timeZone), sans repli silencieux. isValidIanaZone est conservée telle quelle (contrat partagé avec SPEC-202). detectUserTimeZone(valeur navigateur) est une saisie non fiable : toute valeur absente, vide ou inutilisable retombe explicitement sur Europe/Paris (BR-ACC-07), seule fonction autorisée à se replier.

## Conséquences

Un utilisateur en Asie/Kolkata n'est pas refusé et conserve son nom IANA. SPEC-202 et SPEC-602 devraient valider le fuseau saisi par parseTimeZone plutôt que par isValidIanaZone seule pour accepter ces alias. Le repli de détection est le seul endroit où un fuseau invalide ne lève pas d'erreur.
