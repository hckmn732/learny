# ADR-0217 — Regroupement et extraits de la recherche globale

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-212

## Contexte

BR-NAV-05 et ADR-0062 fixent le perimetre et la technique ; search_user_content (SPEC-112) renvoie des lignes classees. Le format de reponse groupee, les quotas par groupe et le surlignage ne sont pas definis.

## Décision

GET /api/v1/search?q=&limit= : q normalisee (NFKC, espaces reduits, trim) de 2 a 100 caracteres apres normalisation ; limit par groupe 5 par defaut (1 a 20) ; reponse { query, groups: [{ kind: notion|chapter|formation, label, items: [{ id, title, snippet, highlights: [{ start, end }], href }], total }] } dans l'ordre fixe Notions, Chapitres, Formations, groupes vides omis. La fonction SQL est appelee avec limit = 3 x limit par groupe, borne 100. Les surlignages sont des positions dans le texte brut, calculees cote serveur sans accent ni casse ; aucun HTML n'est renvoye. Extrait : 160 caracteres maximum autour de la premiere correspondance, ellipse aux coupures. Limitation de debit profil default ; aucun journal ne contient q en clair (seulement sa longueur).

## Conséquences

SPEC-307 affiche les groupes et la page de resultats complete avec limit=20.
