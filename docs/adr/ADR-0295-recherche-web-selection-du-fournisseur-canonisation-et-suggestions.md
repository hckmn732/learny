# ADR-0295 — Recherche web : sélection du fournisseur, canonisation et suggestions

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-512

## Contexte

SPEC-512 expose `search_web` au tuteur. La spécification fixe l'intention (tâche `programme`
uniquement, repli Tavily, normalisation, refus des liens dangereux) mais laisse ouvertes les
valeurs d'implémentation : quand choisir la route native, quelles URL sont « publiques », comment
dédupliquer, comment borner le texte envoyé au modèle et où stocker la raison d'une suggestion.

## Décision

1. **Route** : la recherche serveur Anthropic est utilisée quand le fournisseur résolu possède la
   capacité `web_search` (`providerSupports`). Tout autre fournisseur passe par Tavily. Sans
   `SEARCH_API_KEY`, le repli renvoie `SEARCH_UNAVAILABLE` ; il n'y a ni bascule automatique vers un
   fournisseur payant ni résultat inventé. Le mode `mock` suit les mêmes règles, avec des fixtures
   versionnées et aucun réseau.
2. **URL** : seules les URL HTTP(S) absolues, sans identifiants, dont l'hôte est public sont
   conservées. Les adresses de boucle locale, privées, lien-local, les noms `.local`/`.internal` et
   les schémas `javascript:`, `data:`, `file:` sont supprimés avant le modèle et l'interface. La
   forme canonique retire le fragment, les paramètres de suivi (`utm_*`, `fbclid`, `gclid`), le
   préfixe `www.`, le port par défaut et la barre finale ; les paramètres restants sont triés. Le
   premier résultat d'une URL canonique est conservé, sa provenance (`anthropic` ou `tavily`) est
   attachée à chaque résultat.
3. **Bornes** : requête de 2 à 300 caractères, 1 à 10 résultats (5 par défaut), titre de 200
   caractères, extrait de 400 caractères. La sortie est coupée au budget de texte de la tâche
   programme (6 000 tokens, docs/architecture/ai.md §3) et signalée par `limited`.
4. **Suggestions** : la raison est stockée dans `resources.metadata.suggestionReason`. Une
   suggestion est une ligne `resources` (`origin = tutor_suggestion`, `suggestion_status = pending`)
   et non un contenu de cours ; l'apprenant l'importe ou l'ignore explicitement. La création est
   idempotente par couple (chapitre, URL canonique) ; une décision rejouée est idempotente et une
   décision contradictoire renvoie `CONFLICT`.

## Conséquences

- La démonstration et les tests peuvent comparer les deux routes sans réseau ni clé réelle.
- Toute évolution des bornes ou de la canonisation modifie ce document et les tests `[SPEC-512]`.
- Le schéma JSON de `resources.metadata` accepte la clé optionnelle `suggestionReason` ; aucune
  migration SQL n'est nécessaire (colonne `jsonb` déjà validée comme objet).
