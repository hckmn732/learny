# ADR-0206 — Empreinte de requete pour les cles d'idempotence

- **Statut** : Remplacée par ADR-0219
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-112, SPEC-201, SPEC-208

## Contexte

Le modele initial des idempotency_keys n'enregistre pas le contenu logique de la requete. Une cle rejouee doit retourner le resultat initial seulement si la mutation est identique; une reutilisation pour un autre corps doit etre refusee.

## Décision

> Remplacée par ADR-0219 : ADR-0120 fait foi (422 `IDEMPOTENCY_KEY_REUSED`, colonne `request_hash`, utilisateur hors de l'empreinte). Le texte ci-dessous est conservé pour l'historique.

Chaque ligne idempotency_keys enregistre request_digest, empreinte SHA-256 du corps JSON canonique, de la methode, du chemin et de l'utilisateur. La premiere mutation reserve la cle dans une transaction; un rejeu avec la meme empreinte retourne la reponse enregistree sans executer le service; une empreinte differente retourne 409 IDEMPOTENCY_KEY_REUSED. Les ecritures concurrentes sur la meme cle sont serialisees par contrainte unique et verrou de ligne. La duree de conservation suit SPEC-112 et la purge SPEC-208.

## Conséquences

Les tests couvrent rejeu identique, corps different, concurrence et expiration; aucun corps sensible en clair n'est stocke dans la table.
