# ADR-0267 — Suppression du compte : Auth avant cascade et qualification des exports

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-211, ADR-0044, ADR-0216, ADR-0122, ADR-0047

## Contexte

SPEC-211 ET-4/EF-7 demandent un ordre d'effacement et CL-8 une reprise le lendemain quand auth.admin.deleteUser échoue. Supprimer profiles avant l'Auth laissait la demande introuvable au run suivant. Le catalogue d'événements existant nomme account/export-requested, pas user/export-requested. Le ZIP porte des apports binaires lus en flux, alors que les étapes Inngest ne transportent que du JSON.

## Décision

Le job account-deletion exécute capture, retrait/transmission des groupes, suppression des objets, anonymisation ai_calls, puis auth.admin.deleteUser AVANT le nettoyage idempotent de profiles : un échec Auth laisse deletion_scheduled_for en place et la nuit suivante reprend, e-mail compris. L'événement d'export est account/export-requested (catalogue SPEC-203). Le job data-export collecte un modèle JSON (sans octets), écrit le ZIP en flux dans un fichier temporaire puis l'envoie en upsert au bucket exports ; un rejeu reconstruit l'archive si le fichier temporaire a disparu. La limite de trois exports utilise requested_on (jour local) et un verrou consultatif par utilisateur. Le ZIP normalise les noms (pas de séparateur, de .. ni de contrôle), suffixe les collisions -2/-3 et exclut toute clé d'IA.

## Conséquences

L'ordre de l'ADR-0216 est ajusté : l'appel Auth précède la cascade `profiles`, qui reste l'unique suppression des lignes métier. Une suppression Auth réussie efface donc les données par cascade, et le test d'intégration parcourt `information_schema` après la suppression pour prouver qu'aucune ligne `user_id`/`owner_id` ne subsiste. Le catalogue SPEC-203 reste la source des noms d'événements (`account/export-requested`, `account/deletion-requested`). Le fichier temporaire du ZIP n'est jamais committé ni journalisé ; seuls `exportId`, `userId` haché et les tailles figurent dans les journaux.
