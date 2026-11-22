# ADR-2027 — `learny_api/sse.py` créé par SPEC-2204 malgré la section 2 des conventions

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2204, ADR-2012

## Contexte

`docs/architecture/python-backend/00-conventions.md` section 2 liste
`apps/api-py/src/learny_api/sse.py` dans la disposition de la façade. Jusqu'à SPEC-2204 toutes les
entrées de `api/ownership.yaml` appartenaient à TypeScript et la façade ne faisait que relayer : aucune
route Python ne produisait de `text/event-stream`, et le fichier n'existait pas sur `main` (vérifié
avant cette tranche). `conversations.messages` est la première route `py` dont le corps est un flux
d'événements.

## Décision

Créer le writer maintenant, comme seul endroit des en-têtes du protocole AI SDK UI message stream v1 :
`text/event-stream; charset=utf-8`, `cache-control: no-store`, `x-vercel-ai-ui-message-stream: v1`,
`x-request-id` et `x-served-by: learny-api`. Le corps vient de `learny.tutor.domain.events`, déjà
validé par l'oracle : le writer ne reformate rien. `StreamingResponse` écrit chaque trame dès qu'elle
est produite (aucune mise en tampon) ; une déconnexion du client annule le générateur, ce qui libère
le marqueur de flux en cours et ne laisse aucune transaction ouverte.

## Conséquences

La section 2 redevient exacte. Toute future route SSE réutilise `stream_response`. Le writer ne
contient aucune logique de flux : la séquence reste testable sans HTTP, par le test d'oracle et par
l'intégration.
