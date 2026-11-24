# ADR-3024 — Profil mobile : ligne de base versionnée, sélecteur de date borné et suppression bloquée côté serveur

- **Statut** : Acceptée — précise ADR-3003 § 4 et ADR-3022 pour l'onglet Profil
- **Origine** : Déduite (mise en œuvre de SPEC-3401, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-24
- **Liens** : ADR-0005, ADR-0047, ADR-3001, ADR-3002, ADR-3003, ADR-3004, ADR-3006, ADR-3018, ADR-3022, SPEC-115, SPEC-211, SPEC-721, SPEC-3401

## Contexte

SPEC-3401 déclare un mode visuel `mockup` (racine Profil) et trois exigences que la pile et le
périmètre mobile ne permettent pas de tenir à la lettre.

1. **La racine d'EF-2 ne peut pas superposer l'export.** `design/app-mobile/exports/screens/android-08-profil.png`
   montre un groupe « Apprentissage » qui contient le rythme **et** l'abonnement, et une aide réduite
   à « Centre d'aide » et « Confidentialité ». EF-2 exige quatre groupes (Compte, Apprentissage,
   Abonnement, Aide et confidentialité) et quatre lignes légales (Aide, Conditions d'utilisation,
   Politique de confidentialité, Données et confidentialité). EF-4 interdit en outre le changement de
   mot de passe, donc le sous-titre « Mot de passe, appareils » de l'export. Les valeurs de l'export
   (« 3 formations », « 3 non lues », « Membre depuis septembre ») ne sont pas celles du jeu de
   démonstration (`/me/profile` : 2 formations actives, aucune notification non lue, compte créé le
   21 septembre 2026 → « Membre depuis septembre » reste vrai, mais les pastilles et le compteur
   viennent du serveur).
2. **L'application n'embarque aucun sélecteur de date natif.** ET-2 demande des « sélecteurs de date
   et d'heure natifs ». Le paquet `@react-native-community/datetimepicker` n'est pas une dépendance de
   `apps/mobile` (ADR-3005 limite les paquets partagés importés) et l'ajouter pour une seule feuille
   introduirait un module natif supplémentaire dans l'APK de campagne.
3. **`POST /me/deletion` est cassé sur la pile locale.** La route répond
   `500 INTERNAL_ERROR` (`ReferenceError` levée dans `scheduleDeletion`, journal de l'API) pour tout
   compte, y compris le compte de démonstration. Le défaut est dans le service TypeScript
   (`packages/services/src/personal-data/deletion.ts`), hors du périmètre d'écriture de la piste
   mobile (ADR-3001 §4 : aucune modification du backend avant P35).

## Décision

1. **Comparaison visuelle** — l'unique flux `@visual` de SPEC-3401 capture la racine Profil avant
   toute écriture et la compare à la ligne de base versionnée
   `apps/mobile/e2e/visual/baselines/SPEC-3401-profil.png` (écart de pixels ≤ 12 %, ADR-3003 § 4,
   même méthode qu'ADR-3022). Le masque du flux ne couvre que la barre d'onglets native ; la barre
   d'état est masquée par les zones natives par défaut. Aucune zone de contenu n'est masquée. Les
   écarts structurels ci-dessus (regroupement Abonnement, lignes légales, sous-titre de la sécurité,
   valeurs du serveur) sont mesurés et consignés dans `evidence/SPEC-3401/acceptance.md`, jamais
   présentés comme conformes à l'export statique.
2. **Sélecteur de date borné** — la feuille de pause propose cinq échéances (demain, +3, +7, +14,
   +30 jours) calculées avec `clock.now()` dans le fuseau du profil (ADR-0047, BR-ACC-07), demain
   étant la plus proche (`pause-date-1`, jamais `pause-date-0`). Les heures des réglages de
   notifications sont des propositions bornées de la même forme (`HH:mm`). L'interface respecte
   les cibles tactiles, les rôles et les libellés annoncés ; le remplacement par un sélecteur natif
   est une dette assumée, à rouvrir si un module natif de date entre dans le socle (ADR-3004 §5).
3. **Fuseau horaire en lecture seule** — l'écran Identité affiche le fuseau du profil et renvoie sa
   modification au web (ADR-3002 §3) : aucun sélecteur de fuseau n'est livré au mobile.
4. **Suppression du compte** — le mobile livre et prouve la confirmation (« SUPPRIMER »), le rappel
   du délai de trente jours, la bannière et l'annulation (`DELETE /me/deletion` répond 204 et
   `test/integration/profile.int.test.ts` le vérifie). La **demande** est prouvée par les tests
   d'écran et par le flux Maestro jusqu'à l'activation du bouton ; l'appel n'est pas soumis en
   campagne pour ne pas dépendre d'un défaut serveur hors périmètre. Le défaut est signalé au
   porteur, qui corrige le backend et fusionne ; SPEC-3401 n'écrit pas dans `packages/services`.
5. **Jeu de démonstration intact** — aucun flux ne déclare de pause (elle gèlerait les créneaux à
   venir de toutes les formations actives, SPEC-721) ni ne demande d'export ou de suppression sur le
   compte d'Alex Perrin. Ces mutations sont couvertes par `test/integration/profile.int.test.ts` sur
   un compte éphémère créé avec la clé de service puis supprimé (même méthode que la suite web de
   SPEC-721).

## Conséquences

- Une régression de rendu de la racine Profil est détectée par la ligne de base versionnée.
- L'écart à l'export statique reste documenté ; il devra être re-mesuré si la maquette est un jour
  ré-exportée avec les corrections d'EF-2 et d'EF-4.
- Les mutations destructrices de SPEC-3401 restent hors de la campagne Maestro, et leur preuve est
  reproductible sans `db:reset` : le compte éphémère est supprimé en fin de suite.
- Quand le porteur aura corrigé `scheduleDeletion`, le flux `SPEC-3401-suppression.yaml` pourra
  soumettre la demande puis l'annuler sur un compte de test dédié.
