# ADR-0339 — Applications mobiles Android et iOS en React Native avec Expo

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-18)
- **Date** : 2026-11-18
- **Liens** : ADR-0336, ADR-0340, ADR-0342, SPEC-1301

## Contexte

Learny doit être disponible sur Android et iOS avec une interface très réactive. Options étudiées :

| Option | Réactivité | Code partagé avec le monorepo | Verdict |
|---|---|---|---|
| **React Native + Expo** (nouvelle architecture, Hermes) | Rendu natif, 60 images/s sur les interactions courantes | Contrats Zod, client d'API, logique pure, messages, jetons, TanStack Query, flux du tuteur (AI SDK compatible Expo) | **Retenu** |
| Kotlin (Android) + Swift (iOS) natifs | Maximale | Aucun : deux bases de code, contrats à régénérer | Écarté : coût double, gain marginal pour une application de formation |
| Flutter | Très bonne | Aucun (Dart) | Écarté : réécriture des contrats et de la logique |
| Capacitor (web embarqué) | Celle d'une page web | Tout le web | Écarté : réactivité inférieure, ergonomie non native |

## Décision

1. Android et iOS sont **une seule application** `apps/mobile` en **React Native + Expo** (SDK courant au démarrage, nouvelle architecture activée, Expo Router).
2. Elle réutilise `@learny/contracts`, `@learny/api-client`, `@learny/domain`, `@learny/i18n` et `@learny/ui/tokens` ; les composants d'interface sont **natifs et réécrits** (`packages/ui` repose sur Radix et le DOM ; les vues des briques produisent du HTML).
3. Authentification par Supabase Auth côté application (jetons stockés dans `expo-secure-store`) puis appels de l'API avec `Authorization: Bearer` (ADR-0340).
4. Les spécifications de `apps/mobile` sont rédigées **après la clôture de la piste de migration** (CP-13) ; la piste se limite à rendre l'API prête pour les clients natifs (SPEC-1301).

## Conséquences

- Le périmètre produit (ADR-0005) n'est pas modifié par cet ADR : les écrans mobiles feront l'objet d'une phase dédiée.
- Les notifications push natives (FCM/APNs via Expo) nécessiteront un canal supplémentaire dans `packages/notifications`, spécifié avec l'application mobile.
