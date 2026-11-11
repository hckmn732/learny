# ADR-0216 — Contenu de l'export et execution de la suppression du compte

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-211

## Contexte

ADR-0044 fixe le ZIP, le lien de 7 jours et la suppression a J+30 ; BR-ACC-10 exige un export pret en moins de 15 minutes. L'arborescence exacte, la limite de demandes, l'ordre d'effacement et le sort des formations partagees ne sont pas definis.

## Décision

Arborescence du ZIP : README.txt ; settings.json (profil, preferences, notifications, automatismes, sans secret ni cle chiffree) ; results.json (tentatives, reponses, maitrise, lacunes, series, activite) ; conversations.json ; formations/<slug-formation>/programme.json ; formations/<slug-formation>/<NN>-<slug-module>/cours.md ; apports/<slug-formation>/<NN>-<slug-module>/<nom-original> ; noms normalises sans chemin relatif ni caractere de controle, collisions suffixees -2, -3. Un seul export en cours par utilisateur (une demande pendant un export queued ou running renvoie l'export existant) et au plus 3 demandes par jour local (EXPORT_LIMIT_REACHED). Export qui depasse 15 minutes : statut failed, e-mail non envoye, nouvelle demande permise. Suppression : POST /me/deletion fixe deletion_requested_at et deletion_scheduled_for = maintenant + 30 jours, envoie deletion_scheduled ; la session reste valide ; DELETE /me/deletion annule. Le cron nocturne traite les comptes echus dans cet ordre : capture de l'adresse, retrait de l'utilisateur des groupes (une formation partagee dont il est proprietaire est transmise au membre le plus ancien, sinon supprimee), suppression des fichiers Storage (resources, exports), suppression des lignes metier, suppression du compte Auth (cascade profil), e-mail deletion_completed vers l'adresse capturee. Chaque etape est idempotente et reprise ; ai_calls conserve des lignes anonymisees (user_id nul) pour la comptabilite des couts.

## Conséquences

Colonnes data_exports.error et data_exports.requested_on (migration additive) ; ai_calls.user_id devient nullable avec on delete set null.
