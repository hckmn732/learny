# Fiches des stores — Learny 1.0.0

Fiches de publication de l'application mobile (SPEC-3502 EF-4 ; ADR-3006, BR-PLA-04, BR-PLA-05).

| Élément | Emplacement | État |
|---|---|---|
| Textes FR App Store | `app-store/fr-FR/*.txt` | prêts (générés depuis `metadata.ts`) |
| Textes FR Google Play | `play/fr-FR/*.txt` | prêts (générés depuis `metadata.ts`) |
| Icône 1024 × 1024 | `assets/icon-1024.png` | prête (copie de `assets/icon.png`) |
| Captures Android téléphone | `screenshots/android-phone/*.png` | prêtes (Maestro, 1080 × 2160) |
| Captures iPhone 6,9" et 6,5" | — | **bloqué externe** : aucun macOS, aucun simulateur iOS (ADR-3018) |
| Étiquettes App Store | `privacy/app-store.md` | prêtes |
| Formulaire Data safety Play | `privacy/data-safety.md` | prêt |
| Licences affichées dans l'application | `licenses.json` | généré (`scripts/generate-licenses.mjs`) |

`metadata.ts` est la **source unique** : les fichiers texte sont produits par

```sh
node --experimental-strip-types apps/mobile/store/export-metadata.mjs
node --experimental-strip-types apps/mobile/store/export-metadata.mjs --check   # contrôle
```

et `store/metadata.test.ts` échoue si un fichier diverge de la source ou dépasse une limite de
plateforme (30/30/170/4000/100 pour l'App Store, 30/80/4000 pour Play).

## Liens de la fiche

- Politique de confidentialité : `https://learny.exemple.fr/legal/confidentialite` (SPEC-806).
- Conditions d'utilisation : `https://learny.exemple.fr/legal/cgu`.
- Support : `https://learny.exemple.fr/parametres` — contact `support@learny.exemple.fr`.

`learny.exemple.fr` est le domaine d'exemple documenté par `docs/engineering/coolify.md`
(`LEARNY_PUBLIC_APP_URL`) : le domaine définitif est une décision du porteur, consignée dans
`evidence/SPEC-3502/acceptance.md`. Aucune fiche ne contient d'URL locale.

## Catégorie et classification

- Catégorie : **Éducation** (les deux stores).
- App Store : **4+** (aucun contenu sensible, aucun achat, aucun suivi, aucun contenu généré par
  l'utilisateur visible par d'autres).
- Google Play : questionnaire de classification rempli « Tous publics » ; l'application ne diffuse
  aucun contenu, n'autorise aucun échange entre utilisateurs et ne collecte aucune donnée
  publicitaire.

## Ce qui n'est pas dans ce répertoire

Aucun prix, aucun lien d'achat, aucun identifiant de compte : l'application ne vend rien et ne
propose aucun achat intégré (ADR-3006 § 1, `src/api/billing-guard.ts`). Les captures iOS et les
exports signés exigent un compte Apple Developer et un runner macOS : blocage externe.
