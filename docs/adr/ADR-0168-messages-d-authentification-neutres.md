# ADR-0168 — Messages d'authentification neutres

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-601)
- **Date** : 2026-11-11
- **Liens** : SPEC-601, SPEC-202

## Contexte

Les écrans d'inscription et de connexion ne doivent pas permettre de tester l'existence d'une adresse e-mail. L'adresse saisie doit rester disponible sur l'écran de vérification sans apparaître dans l'URL ou les journaux.

## Décision

Une demande de lien magique renvoie toujours `202` avec le même écran « Vérifiez votre e-mail », y compris pour une adresse inconnue. Une inscription par mot de passe sur une adresse existante suit la réponse neutre fournie par Supabase ; seul un essai de connexion par mot de passe peut échouer, avec un message identique pour adresse inconnue et mauvais mot de passe. Le navigateur conserve temporairement l'adresse dans `sessionStorage` pour la page de vérification, jamais dans les paramètres d'URL. Les journaux ne contiennent pas l'adresse en clair ; la limitation de débit de SPEC-208 s'applique à l'envoi et au renvoi.

## Conséquences

Les tests comparent statuts, corps, temps de réponse dans une marge raisonnable et textes pour adresses existantes/inexistantes, sans révéler laquelle est enregistrée.
