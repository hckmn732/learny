# ADR-4011 — Ecran de compte mobile tenant sans defilement, icones et lancement Learny

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-25
- **Liens** : SPEC-3101, SPEC-3002, ADR-3003, ADR-4002

## Contexte

Retour du porteur sur la QA (2026-11-25, video sur téléphone Android) : la bascule Se connecter / Créer un compte remontait un nouvel écran (router.replace) avec une transition, le formulaire débordait de l'écran (Google, Apple et le lien magique hors de vue en inscription), la feuille du lien de connexion restait sous le clavier, et l'écran de lancement montrait le logo Expo : les ressources apps/mobile/assets étaient celles du gabarit Expo.

## Décision

1. Le contrôle segmenté de AuthScreen change le mode sur place (état local), sans navigation. 2. AuthScreen mesure son contenu : s'il dépasse la hauteur visible, l'écran passe une fois à un rythme compact (titre de la variante title, marges resserrées, champs de 48 dp, TextField dense), sans retirer aucun élément ni libellé ; un écran aussi haut que la maquette garde le rythme de la maquette et sa ligne de base visuelle. 3. Sheet place son panneau dans un KeyboardAvoidingView (padding) : une fenêtre Modal Android n'est pas redimensionnée par le clavier. 4. Icône, icône adaptative (fond lime, monochrome), favicon et écran de lancement (plugin expo-splash-screen, fond canvas) reprennent la marque de la maquette mobile : tuile lime et M à l'encre (logo de src/ui/icons.tsx).

## Conséquences

Aucun libellé, contrat ni ligne de base visuelle modifiés. Test Jest de la bascule sur place et du rythme compact dans apps/mobile/test/auth/account-form.test.tsx.
